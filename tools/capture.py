
import asyncio, sys, json, time, math
from playwright.async_api import async_playwright
URL=sys.argv[1]; OUT=sys.argv[2]; FPS=int(sys.argv[3]); DUR=float(sys.argv[4])
UA="Mozilla/5.0 (Linux; Android 14; Pixel 7a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
K=[ # t, center, zoom, pitch, bearing
 (0.0, [78.405,17.428], 12.9, 58, -25),
 (2.6, [78.386,17.445], 14.6, 66, -5),
 (4.2, [78.3812,17.4480], 16.5, 73, 20),
 (6.4, [78.3800,17.4470], 16.9, 76, 75),
 (9.0, [78.3450,17.4170], 16.2, 75, 95),
 (11.2,[78.3500,17.4200], 15.9, 74, 140),
 (13.6,[78.3720,17.4380], 14.8, 68, 190),
 (15.0,[78.3800,17.4420], 14.4, 64, 205)]
def ease(t): return t*t*(3-2*t)
def cam(t):
    for i in range(len(K)-1):
        if K[i][0]<=t<=K[i+1][0]:
            a,b=K[i],K[i+1]; u=ease((t-a[0])/(b[0]-a[0]))
            return {"center":[a[1][0]+(b[1][0]-a[1][0])*u, a[1][1]+(b[1][1]-a[1][1])*u],"zoom":a[2]+(b[2]-a[2])*u,"pitch":a[3]+(b[3]-a[3])*u,"bearing":a[4]+(b[4]-a[4])*u}
    a=K[-1]; return {"center":a[1],"zoom":a[2],"pitch":a[3],"bearing":a[4]}
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        ctx=await b.new_context(viewport={"width":412,"height":915},device_scale_factor=1.5,user_agent=UA,is_mobile=True,has_touch=True)
        pg=await ctx.new_page()
        await pg.goto(URL, wait_until="load", timeout=60000)
        await pg.wait_for_timeout(5000)
        await pg.mouse.click(206,300); await pg.wait_for_timeout(1000)
        # warm the tile cache along the path
        for t in [0,2.6,4.2,6.4,9,11.2,13.6,15]:
            await pg.evaluate("(c)=>{const m=window.__mw.map; m.stop(); m.jumpTo(c);}", cam(t)); await pg.wait_for_timeout(3500)
        await pg.evaluate("()=>window.__mw.setTimeOfDay('day')"); await pg.wait_for_timeout(1500)
        n=int(FPS*DUR); t0=time.time(); state='day'
        for f in range(n):
            t=f/FPS
            if t>=9.6 and state=='day': await pg.evaluate("()=>window.__mw.setTimeOfDay('dusk')"); state='dusk'
            if t>=11.6 and state=='dusk': await pg.evaluate("()=>window.__mw.setTimeOfDay('night')"); state='night'
            await pg.evaluate("""async (c)=>{const m=window.__mw.map; m.jumpTo(c);
               const t0=performance.now();
               await new Promise(r=>{ const chk=()=>{ const s=window.__mw.city&&window.__mw.city.stats(); if((m.areTilesLoaded() && (!s||(s.loading===0&&s.queued===0))) || performance.now()-t0>5000) r(); else setTimeout(chk,60); }; m.triggerRepaint(); setTimeout(chk,30); });
               for (let i=0;i<3;i++) await new Promise(r=>{m.once('render',r); m.triggerRepaint();});
            }""", cam(t))
            await pg.screenshot(path=f"{OUT}/f{f:04d}.png")
            if f%24==0: print(f, round(time.time()-t0,1), flush=True)
        await b.close()
asyncio.run(main())
