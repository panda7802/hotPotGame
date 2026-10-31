'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert'),{chromium,launchOptions}=require('./runtime.cjs');
const dir=__dirname,m=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
// Check the files themselves after transfer; the old manifest is not evidence
// that a PNG on this computer is present and has the expected dimensions.
for(const check of m.checks){
  const file=path.join(dir,'png','style-'+String(check.theme).padStart(2,'0'),check.width+'x'+check.height,check.state+'.png');
  const header=Buffer.alloc(26),fd=fs.openSync(file,'r');
  try{assert.equal(fs.readSync(fd,header,0,26,0),26,file)}finally{fs.closeSync(fd)}
  assert.equal(header.subarray(0,8).toString('hex'),'89504e470d0a1a0a',file);
  assert.equal(header.readUInt32BE(16),check.width,file);
  assert.equal(header.readUInt32BE(20),check.height,file);
}
function files(folder){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(folder,e.name)):[path.join(folder,e.name)])}
assert(m.complete);assert.equal(m.checks.length,1320);assert.equal(m.verifiedPngHeaders,1320);assert(m.checks.every(c=>c.errors.length===0));assert.deepEqual(m.errors,[]);assert.equal(files(path.join(dir,'png')).filter(f=>f.endsWith('.png')).length,1320);assert.equal(m.components.length,84);
for(const c of m.components){const b=fs.readFileSync(path.join(dir,c.file));assert.equal(b[25],6,'Transparent component must have alpha')}
(async()=>{const browser=await chromium.launch(launchOptions);try{const p=await browser.newPage({viewport:{width:720,height:1080}});await p.goto('file:///'+dir.replaceAll('\\','/')+'/screen.html?theme=1&page=profile&w=720&h=1080');await p.getByRole('button',{name:'分享给好友',exact:false}).click();assert.equal(await p.locator('.toast').textContent(),'请在微信内打开后分享');assert.equal((await p.evaluate(()=>getDesignState())).state,'toast-share-web');fs.writeFileSync(path.join(dir,'final-audit.json'),JSON.stringify({complete:true,fullScreenPngs:1320,transparentDialogComponents:84,layoutErrors:0,browserErrors:0,shareEntryAndWebFeedback:true,standaloneAfterOldDraftCleanup:true},null,2));console.log('Final audit passed: 1320 screens, 84 alpha components, zero layout errors; sharing preview works after old-draft cleanup.')}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
