import asyncio, json, subprocess, glob, pathlib
HERE=pathlib.Path(__file__).resolve().parent
from playwright.async_api import async_playwright
FR=45*30
async def main():
    exe=glob.glob('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0]
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path=exe)
        pg=await b.new_page(viewport={'width':1080,'height':1080})
        await pg.goto((HERE/'film.html').as_uri())
        await pg.evaluate("document.fonts.load('italic 66px Lora').then(()=>document.fonts.load('400 22px Lora'))")
        ff=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','image2pipe','-framerate','30','-c:v','mjpeg','-i','-','-c:v','libx264','-preset','slow','-crf','21','-pix_fmt','yuv420p','video.mp4'],stdin=subprocess.PIPE)
        ev=[]
        for i in range(FR):
            ev+=await pg.evaluate("advance()")
            ff.stdin.write(await pg.screenshot(type='jpeg',quality=95))
            if i%300==0: print(i,len(ev),flush=True)
        ff.stdin.close(); ff.wait(); await b.close()
        json.dump(ev,open('events.json','w')); print('events',len(ev))
asyncio.run(main())
