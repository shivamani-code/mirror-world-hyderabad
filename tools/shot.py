
import asyncio, sys, json, time
from playwright.async_api import async_playwright
URL=sys.argv[1]; OUT=sys.argv[2]; views=json.loads(sys.argv[3])
UA="Mozilla/5.0 (Linux; Android 14; Pixel 7a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist","--enable-webgl"])
        ctx=await b.new_context(viewport={"width":412,"height":915},device_scale_factor=2 if len(sys.argv)<5 else float(sys.argv[4]),user_agent=UA,is_mobile=True,has_touch=True)
        pg=await ctx.new_page()
        logs=[]
        pg.on("console", lambda m: logs.append(m.type+": "+m.text))
        pg.on("pageerror", lambda e: logs.append("PAGEERROR: "+str(e)))
        await pg.goto(URL, wait_until="load", timeout=60000)
        await pg.wait_for_timeout(4000)
        # stop intro / tour
        await pg.mouse.click(206,300)
        await pg.wait_for_timeout(1500)
        for v in views:
            js=v.get('js','')
            await pg.evaluate("""([v,js])=>{ const m=window.__mw.map; m.stop(); if(js) eval(js); m.jumpTo({center:v.center,zoom:v.zoom,pitch:v.pitch,bearing:v.bearing}); }""",[v,js])
            t0=time.time()
            for i in range(int(v.get('wait',40))):
                await pg.wait_for_timeout(1000)
                st=await pg.evaluate("()=>window.__mw.city? window.__mw.city.stats():null")
                if st and st.get('loading',1)==0 and st.get('queued',1)==0 and i>6: break
            await pg.wait_for_timeout(2500)
            await pg.screenshot(path=OUT+v['name']+'.png')
            print(v['name'], round(time.time()-t0,1), json.dumps(st))
        print("\n".join(logs[-25:]))
        await b.close()
asyncio.run(main())
