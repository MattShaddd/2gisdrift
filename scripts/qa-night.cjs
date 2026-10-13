// Optional live Chromium check, using a separate temporary profile.
const {chromium} = require('playwright');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const extension=path.resolve(__dirname,'../extension');
  const context=await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(),'drift-night-')),{
    executablePath:process.env.DRIFT_CHROMIUM,channel:'chromium',headless:false,
    args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],viewport:{width:1440,height:960}
  });
  try {
    const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),page=context.pages()[0];
    await page.goto('https://2gis.ru/novosibirsk?m=82.945737%2C55.020442%2F19%2Fp%2F50',{waitUntil:'domcontentloaded',timeout:60000});
    await page.evaluate(()=>{localStorage.setItem('2gis-drift-welcome','hidden');localStorage.removeItem('2gis-drift-night');});
    const tab=await worker.evaluate(async()=>{const t=(await chrome.debugger.getTargets()).find(t=>t.type==='page'&&t.url.startsWith('https://2gis.ru/'));return {id:t.tabId,url:t.url};});
    await worker.evaluate(t=>handleAction(t),tab);
    try {await page.waitForFunction(()=>window.driftCarRuntime?.getState().active&&window.driftNightMode&&!driftNightMode.getState().applying,null,{timeout:120000});}
    catch(e) {
      console.log('PREPARATION FAILED',await worker.evaluate(id=>({error:sessions.get(id)?.error,workerError:sessions.get(id)?.workerError}),tab.id));
      console.log('RUNTIME',await page.evaluate(()=>({night:window.driftNightMode?.getState(),car:window.driftCarRuntime?.getState().active,chunks:window.driftStreamingBridge?.getState()})));
      throw e;
    }
    async function state(){return page.evaluate(()=>({night:driftNightMode.getState(),active:driftCarRuntime.getState().active,model:driftCarModel.getState().attached,water:driftWaterVisibility.getState(),chunks:driftStreamingBridge.getState().chunks,gl:mapgl.getWebGLContext().getError()}));}
    const startup=await state();console.log('STARTUP GL',startup.gl);
    await page.waitForTimeout(2000);
    let s=await state();console.log('NIGHT READY',s);
    assert(s.night.enabled&&s.night.windowLayers>0&&s.night.treeLayers>0&&s.night.modelLayers>0&&!s.night.error);
    assert.equal(await page.evaluate(()=>driftCarRuntime.settings.cameraPitch),78,'Default camera pitch');
    assert(s.model&&s.chunks>0&&s.water.patchedLayers>0);assert.equal(s.gl,0);
    const output=path.resolve(__dirname,'../output');fs.mkdirSync(output,{recursive:true});
    await page.screenshot({path:path.join(output,'night-windows-camera.png')});
    await page.bringToFront();await page.mouse.click(950,400);
    const before=await page.evaluate(()=>driftCarRuntime.getState().geo);
    await page.keyboard.down('w');await page.waitForTimeout(1200);await page.keyboard.up('w');
    const after=await page.evaluate(()=>driftCarRuntime.getState().geo);
    assert(Math.hypot(...after.map((v,i)=>v-before[i]))>1e-7,'Car must drive at night');
    await page.keyboard.press('F9');
    await page.waitForFunction(()=>!driftNightMode.getState().enabled&&!driftNightMode.getState().applying);
    await page.waitForTimeout(1500);s=await state();assert(!s.night.error&&s.model&&s.water.patchedLayers>0);assert.equal(s.gl,0);
    await page.reload();
    await page.waitForFunction(()=>window.driftCarRuntime?.getState().active&&window.driftNightMode,null,{timeout:120000});
    assert.equal((await state()).night.enabled,false,'Saved day preference must survive reload');
    await page.bringToFront();
    await page.evaluate(()=>{const canvas=mapgl.getCanvas();canvas.tabIndex=0;canvas.focus();});
    await page.keyboard.press('F9');
    await page.waitForFunction(()=>driftNightMode.getState().enabled&&!driftNightMode.getState().applying);
    await page.waitForTimeout(1500);
    // A recognisable landmark with a native glTF building, not just extruded polygons.
    await page.evaluate(()=>driftCarRuntime.setActive(false));
    await page.waitForTimeout(150);
    await page.evaluate(()=>{mapgl.setZoom(18.5,{duration:0});mapgl.setPitch(60,{duration:0});mapgl.setCenter([82.9256,55.0303],{duration:0});});
    await page.waitForTimeout(3500);
    const lit=await page.evaluate(()=>{const m=mapgl._impl.modules,s=m.styleManager.getStyle(mapgl._impl.state.handyStyleId);return {mode:!!s.light.lightingModes.driftNightModels,visibleModels:[...m.modelsScene.sceneObjects.values()].filter(o=>m.styleManager.getStyleLayer(o.attributes.styleId,o.attributes.layerId)?.lightingMode==='driftNightModels').length};});
    assert(lit.mode&&lit.visibleModels>0,JSON.stringify(lit));
    const center=await page.evaluate(()=>mapgl.getCenter());assert(Math.hypot(center[0]-82.9256,center[1]-55.0303)<1e-5,'Landmark view must stay in place');
    await page.screenshot({path:path.join(output,'night-landmark.png')});
    await page.reload();await page.waitForFunction(()=>window.driftCarRuntime?.getState().active&&window.driftNightMode&&!driftNightMode.getState().applying,null,{timeout:120000});
    s=await state();assert(s.night.enabled&&!s.night.error&&s.model);assert.equal(s.gl,0);
    console.log('PASS: default night, windows, trees and model lighting, driving, F9, day/night persistence, water, native landmark, reload, GL');
  } finally {await context.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
