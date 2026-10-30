
import duckdb, json, re, math, gzip, struct, os, sys
import numpy as np
from shapely import wkb as swkb
from shapely.geometry import shape, Point
from shapely.strtree import STRtree
W=sys.argv[1]; OUT=sys.argv[2]
BB=(78.28,78.56,17.33,17.50)
Z=14; N=2**Z; EXT=4096
con=duckdb.connect(); con.sql("LOAD spatial;")
rows=con.sql(f"SELECT height, wkb, x, y, source FROM read_parquet('{W}/hyd.parquet') WHERE x BETWEEN {BB[0]} AND {BB[1]} AND y BETWEEN {BB[2]} AND {BB[3]}").fetchall()
print('gba',len(rows),flush=True)
# OSM tagged heights
osm=[]
for line in open(f'{W}/osm_h.geojsonseq'):
    f=json.loads(line.strip().lstrip('\x1e')); p=f['properties']; h=None
    try:
        if 'height' in p: h=float(re.findall(r'[\d.]+',p['height'])[0])
        elif 'building:levels' in p: h=float(re.findall(r'[\d.]+',p['building:levels'])[0])*3.3
    except Exception: pass
    if not h or f['geometry']['type'] not in ('Polygon','MultiPolygon'): continue
    g=shape(f['geometry'])
    if not g.is_valid: g=g.buffer(0)
    c=g.centroid
    if not (BB[0]<=c.x<=BB[1] and BB[2]<=c.y<=BB[3]): continue
    mn=0.0
    try:
        if 'min_height' in p: mn=float(re.findall(r'[\d.]+',p['min_height'])[0])
    except Exception: pass
    osm.append((g,min(h,250),mn,p.get('name')))
print('osm tagged',len(osm),flush=True)
tree=STRtree([o[0] for o in osm])
def merc(lon,lat):
    x=(lon+180)/360; s=math.sin(math.radians(lat)); y=0.5-math.log((1+s)/(1-s))/(4*math.pi); return x,y
feats=[]  # (tx,ty,h,flag,ring[(mx,my)])
def add(g,h,flag,lon=None,lat=None,salt=0):
    polys=[g] if g.geom_type=='Polygon' else list(g.geoms)
    for p in polys:
        if p.area<=0: continue
        ring=list(p.exterior.coords)[:-1]
        if len(ring)<3: continue
        mr=[merc(a,b) for a,b in ring]
        cx=sum(m[0] for m in mr)/len(mr); cy=sum(m[1] for m in mr)/len(mr)
        yr=appear(lon,lat,salt) if lon is not None else 2018
        feats.append((int(cx*N),int(cy*N),h,(yr-1975)|(128 if flag else 0),mr))
GR=json.load(open(sys.argv[3]))
gcells={(c[0],c[1]):c for c in GR['cells']}
import hashlib
def appear(lon,lat,salt):
    R=6378137.0
    X=R*math.radians(lon); Y=R*math.log(math.tan(math.pi/4+math.radians(lat)/2))
    c=int((X-GR['x0'])//GR['step']); r=int((GR['y0']-Y)//GR['step'])
    cell=gcells.get((c,r))
    hv=((salt*2654435761)&0xffffffff)/4294967296.0
    if not cell: return 2018
    b=[cell[3],cell[4],cell[5],cell[6],cell[7]]; yrs=[1990,2000,2010,2020,2025]
    top=max(b[4],1)
    f=[min(1.0,v/top) for v in b]
    if hv<f[0]: return 1990
    for i in range(1,5):
        if hv<f[i]:
            t=(hv-f[i-1])/max(1e-6,f[i]-f[i-1]); return int(round(yrs[i-1]+t*(yrs[i]-yrs[i-1])))
    return 2022
dropped=0
EXC=[(78.47475,17.36163,22)]
def excluded(x,y):
    return any(math.hypot((x-a)*106000,(y-b)*111320)<r for a,b,r in EXC)
for h,w,x,y,src in rows:
    if excluded(x,y): continue
    hits=tree.query(Point(x,y))
    if len(hits):
        pt=Point(x,y)
        if any(osm[i][0].contains(pt) for i in hits): dropped+=1; continue
    g=swkb.loads(bytes(w))
    g=g.simplify(0.000006, preserve_topology=True)  # ~0.6 m
    add(g, max(3.0,float(h or 0)), 0, x, y, len(feats)*7919+13)
for g,h,mn,name in osm:
    if excluded(g.centroid.x,g.centroid.y): continue
    cc=g.centroid; add(g.simplify(0.000004,preserve_topology=True), max(3.0,h), 1, cc.x, cc.y, len(feats)*7919+13)
print('feats',len(feats),'dropped gba under osm',dropped,flush=True)

# ---- Google Open Buildings 2.5D Temporal (2016/2019/2023): per-building height + when it appeared ----
import numpy as np, rasterio, shapely, time as _t
from rasterio.features import rasterize
from pyproj import Transformer
from shapely.geometry import Polygon
inv=lambda mx,my:( mx*360-180, math.degrees(math.atan(math.sinh(math.pi*(1-2*my)))) )
tr=Transformer.from_crs('EPSG:4326','EPSG:32644',always_xy=True)
polys=[]
for f in feats:
    xs=[];ys=[]
    for mx,my in f[4]:
        lo,la=inv(mx,my); xs.append(lo); ys.append(la)
    ux,uy=tr.transform(xs,ys)
    polys.append(Polygon(list(zip(ux,uy))))
print('utm polys',len(polys),flush=True)
B=np.array([p.bounds for p in polys])
G25=json.load(open(W+'/g25_tiles.json'))
hY={y:np.zeros(len(feats),np.float32) for y in (2016,2019,2023)}
for u,bb,*_ in G25:
    name=u.split('/')[-1]
    with rasterio.open('/vsicurl/'+u) as d:
        f4=4; H_=d.height//f4; W_=d.width//f4
        T=d.transform*rasterio.Affine.scale(d.width/W_, d.height/H_)
        L,Bm,R,Tp=d.bounds
    sel=np.where((B[:,2]>L)&(B[:,0]<R)&(B[:,3]>Bm)&(B[:,1]<Tp))[0]
    if len(sel)==0: continue
    t0=_t.time()
    ids=rasterize(((polys[i],int(i)+1) for i in sel),out_shape=(H_,W_),transform=T,fill=0,dtype='int32')
    m=ids>0; iv=ids[m]-1
    for y in (2023,2019,2016):
        uu=u.replace('_2023_06_30/',f'_{y}_06_30/')
        with rasterio.open('/vsicurl/'+uu) as d:
            arr=d.read(2,out_shape=(H_,W_))
        v=np.nan_to_num(arr[m]).astype(np.float32)
        np.maximum.at(hY[y],iv,v)
    print(name,len(sel),round(_t.time()-t0,1),flush=True)
np.savez(W+'/g25_heights.npz',**{str(k):v for k,v in hY.items()})
newf=[]
src_count={'osm':0,'g25':0,'gba':0}
for i,f in enumerate(feats):
    tx,ty,h,fl,mr=f
    osm_t=fl>>7; yr=(fl&127)+1975
    g23,g19,g16=float(hY[2023][i]),float(hY[2019][i]),float(hY[2016][i])
    if osm_t: src_count['osm']+=1
    elif g23>=2.5: h=g23; src_count['g25']+=1
    else: src_count['gba']+=1
    if g23>=2.5:
        if g16>=2.5: yr=min(yr,2016)
        elif g19>=2.5: yr=2017+(i%3)
        else: yr=2020+(i%4)
    newf.append((tx,ty,max(3.0,h),(yr-1975)|(128 if osm_t else 0),mr))
feats=newf
print('height sources',src_count,flush=True)
from collections import defaultdict
tiles=defaultdict(list)
for f in feats: tiles[(f[0],f[1])].append(f)
os.makedirs(OUT,exist_ok=True)
def zz(v): return (v<<1)^(v>>31)
def varint(v,buf):
    while v>=0x80: buf.append((v&0x7f)|0x80); v>>=7
    buf.append(v)
total=0; index={}
for (tx,ty),fs in tiles.items():
    # importance: tall first
    fs.sort(key=lambda f:-f[2])
    ntall=sum(1 for f in fs if f[2]>=12)
    H=bytearray(); NV=bytearray(); FL=bytearray(); FIRST=bytearray(); D=bytearray()
    for f in fs:
        pts=[(round((m[0]*N-tx)*EXT),round((m[1]*N-ty)*EXT)) for m in f[4]]
        # dedupe consecutive
        q=[pts[0]]
        for p in pts[1:]:
            if p!=q[-1]: q.append(p)
        if len(q)>1 and q[-1]==q[0]: q.pop()
        if len(q)<3: q=q+[q[-1]]*(3-len(q))
        q=q[:255]
        # ensure clockwise/ccw consistent: make CCW in screen coords (y down) -> compute signed area
        a=sum(q[i][0]*q[(i+1)%len(q)][1]-q[(i+1)%len(q)][0]*q[i][1] for i in range(len(q)))
        if a<0: q=q[::-1]
        H.append(min(255,int(round(f[2])))); NV.append(len(q)); FL.append(f[3])
        FIRST+=struct.pack('<hh',max(-32768,min(32767,q[0][0])),max(-32768,min(32767,q[0][1])))
        for i in range(1,len(q)):
            varint(zz(q[i][0]-q[i-1][0]),D); varint(zz(q[i][1]-q[i-1][1]),D)
    hdr=struct.pack('<4sIII',b'MW3B',len(fs),ntall,len(D))
    raw=hdr+bytes(H)+bytes(NV)+bytes(FL)+bytes(FIRST)+bytes(D)
    gz=gzip.compress(raw,9)
    open(f'{OUT}/{tx}-{ty}.bin','wb').write(gz)
    total+=len(gz); index[f'{tx}-{ty}']=[len(fs),ntall,len(gz)]
json.dump(index,open(f'{OUT}/index.json','w'))
print('tiles',len(tiles),'total gz',total, 'avg per bld', total/len(feats))
