// 重新產生使用說明的圖片。介面改版後跑一次：先用本機伺服器開網站（路徑 /ramp-lab/），再 node tools/help-shots.js
// 網站位址可以用環境變數 URL 指定；需要 Playwright，圖片縮小用 Python 的 Pillow。
const {chromium}=require('playwright');const path=require('path');const fs=require('fs');const {execFileSync}=require('child_process');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'help'),TMP=path.join(process.env.TMPDIR||'/tmp','ramp-help');const URL_=process.env.URL||'http://127.0.0.1:8123/ramp-lab/';
fs.mkdirSync(TMP,{recursive:true});fs.mkdirSync(OUT,{recursive:true});
async function cap(p,name,sels,marks=[],pad=10){
  await p.evaluate(m=>{document.querySelectorAll('[data-mk]').forEach(x=>{x.style.outline='';x.style.outlineOffset='';x.removeAttribute('data-mk');});m.forEach(q=>{const e=document.querySelector(q);if(e){e.setAttribute('data-mk','1');e.style.outline='4px solid #C9962E';e.style.outlineOffset='3px';}});},marks);
  await p.waitForTimeout(60);
  const r=await p.evaluate(s=>{const R=s.map(q=>document.querySelector(q)).filter(Boolean).map(x=>x.getBoundingClientRect());return [Math.min(...R.map(x=>x.left)),Math.min(...R.map(x=>x.top)),Math.max(...R.map(x=>x.right)),Math.max(...R.map(x=>x.bottom))];},sels);
  const v=p.viewportSize(),x=Math.max(0,r[0]-pad),y=Math.max(0,r[1]-pad);
  await p.screenshot({path:path.join(TMP,name+'.png'),clip:{x,y,width:Math.min(v.width,r[2]+pad)-x,height:Math.min(v.height,r[3]+pad)-y}});
  await p.evaluate(()=>document.querySelectorAll('[data-mk]').forEach(x=>{x.style.outline='';x.style.outlineOffset='';x.removeAttribute('data-mk');}));
}
const set=(p,th,s,surf)=>p.evaluate(([th,s,surf])=>{const a=document.getElementById('slope'),b=document.getElementById('rider');a.value=th;a.dispatchEvent(new Event('input'));b.value=s;b.dispatchEvent(new Event('input'));document.getElementById('surf-'+surf).click();},[th,s,surf]);
(async()=>{
  const b=await chromium.launch({args:['--no-sandbox','--autoplay-policy=user-gesture-required']});
  const mk=async(o={})=>{const c=await b.newContext({viewport:{width:o.w||420,height:o.h||1500},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'light',serviceWorkers:'block'});if(o.init)await c.addInitScript(o.init);const p=await c.newPage();await p.route(/fonts\./,r=>r.abort());return p;};
  // 模擬器
  let p=await mk();await p.goto(URL_+'#sim');await p.waitForTimeout(3300);await p.addStyleTag({content:'.stage{position:relative!important;box-shadow:none!important}'});
  await cap(p,'sim1',['.stage'],['.stage .fsbtn'],6);
  await cap(p,'sim2',['.panel .card > .control:nth-child(1)'],['#slope']);
  await cap(p,'sim3',['.panel .card > .control:nth-child(2)'],['#rider']);
  await cap(p,'sim4',['.panel .card > fieldset:nth-child(3)','.panel .card > fieldset:nth-child(4)'],['.panel .card > fieldset:nth-child(3) .seg']);
  await set(p,17,6,'grip');await p.waitForTimeout(2200);await cap(p,'sim5',['.stage'],['#result'],6);
  // 三個秘密
  await p.click('#tab-secrets');await p.waitForTimeout(1600);await cap(p,'sec1',['.subtabs','.secret:not([hidden]) .vbox'],['.subtabs']);
  await cap(p,'sec4',['#revealBtn'],['#revealBtn'],12);
  await p.context().close();
  p=await mk({init:()=>{HTMLMediaElement.prototype.play=function(){return Promise.reject(new DOMException('x','NotAllowedError'));};}});await p.goto(URL_+'#secrets');await p.waitForTimeout(900);await cap(p,'sec2',['.secret:not([hidden]) .vbox'],['.secret:not([hidden]) .vplay'],8);await p.context().close();
  p=await mk({w:844,h:390});await p.goto(URL_+'#secrets');await p.waitForTimeout(800);await p.click('.secret:not([hidden]) .fsbtn');await p.waitForTimeout(1500);await p.screenshot({path:path.join(TMP,'sec3.png')});await p.context().close();
  // 在家玩
  p=await mk();await p.goto(URL_+'#home');await p.waitForTimeout(400);
  await cap(p,'home1',['.home-h','.home-art'],[]);
  await cap(p,'home2',['.conv-grid','.conv-out'],['.conv-grid']);
  await cap(p,'home3',['.conv p.conv-title[style]','.hgt'],['.hgt']);
  await cap(p,'home4',['#convApply'],['#convApply'],12);
  await p.context().close();
  // 示意圖
  const q=await (await b.newContext({viewport:{width:640,height:520},deviceScaleFactor:1})).newPage();await q.goto('file://'+path.join(ROOT,'tools/ins.html'));
  for(const id of ['ins1','ins2','ins3','ins4','ins5']){await q.evaluate(i=>document.querySelectorAll('.s').forEach(x=>{x.style.display=x.id===i?'block':'none';}),id);await q.waitForTimeout(80);await q.screenshot({path:path.join(TMP,id+'.png'),clip:{x:0,y:0,width:640,height:520}});}
  await b.close();
  execFileSync('python3',['-c',`
import glob,os
from PIL import Image
for f in sorted(glob.glob(r'''${TMP}/*.png''')):
    i=Image.open(f).convert('RGB')
    if i.width>720:i=i.resize((720,int(i.height*720/i.width)),Image.LANCZOS)
    o=os.path.join(r'''${OUT}''',os.path.basename(f)[:-4]+'.jpg');i.save(o,'JPEG',quality=82,optimize=True,progressive=True);print(os.path.basename(o),i.size,os.path.getsize(o)//1024,'KB')
`],{stdio:'inherit'});
})().catch(e=>{console.error(e);process.exit(1)});
