const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const ctx=vm.createContext({});
const script=html.match(/<script id="screen-mode">([\s\S]*?)<\/script>/);
if(script)vm.runInContext(script[1],ctx);
const mode=ctx.WorkoutScreen;

test('Fullscreen button enters the screen using the page element',async()=>{
  assert.ok(mode,'Fullscreen control is not implemented');
  let called=false;
  const doc={documentElement:{async requestFullscreen(){assert.equal(this,doc.documentElement);called=true;}},fullscreenElement:null};
  assert.equal(await mode.toggle(doc),true);
  assert.equal(called,true);
});

test('Fullscreen button exits when the page is already fullscreen',async()=>{
  assert.ok(mode,'Fullscreen control is not implemented');
  let exited=false;
  const doc={documentElement:{},fullscreenElement:{},async exitFullscreen(){assert.equal(this,doc);exited=true;}};
  assert.equal(await mode.toggle(doc),false);
  assert.equal(exited,true);
});

test('Unavailable or denied fullscreen does not report success',async()=>{
  assert.ok(mode,'Fullscreen control is not implemented');
  await assert.rejects(mode.toggle({documentElement:{}}));
  await assert.rejects(mode.toggle({documentElement:{async requestFullscreen(){throw Error('Denied');}}}));
});

test('Fullscreen supports the prefixed API used by older WebKit',async()=>{
  assert.ok(mode,'Fullscreen control is not implemented');
  let entered=false,exited=false;
  const doc={documentElement:{webkitRequestFullscreen(){entered=true;}},webkitExitFullscreen(){exited=true;}};
  assert.equal(await mode.toggle(doc),true);
  doc.webkitFullscreenElement={};
  assert.equal(await mode.toggle(doc),false);
  assert.equal(entered,true);
  assert.equal(exited,true);
});
