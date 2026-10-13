// Optional integration check: install Playwright separately, then node scripts/qa-browser.cjs.
const {chromium} = require('playwright');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const extension = path.resolve(__dirname, '../extension');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), '2gisdrift-qa-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', executablePath: process.env.DRIFT_CHROMIUM, headless: false,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: {width: 1440, height: 960}
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const page = context.pages()[0];
    const pageErrors = new Set();
    page.on('pageerror', error => { if (!pageErrors.has(error.message)) {pageErrors.add(error.message); console.log('PAGE ERROR', error.stack);} });
    await page.goto('https://2gis.ru/novosibirsk?m=82.945737%2C55.020442%2F19%2Fp%2F50');
    await page.evaluate(()=>localStorage.setItem('2gis-drift-welcome','hidden'));
    const tab = await worker.evaluate(async () => {
      const target = (await chrome.debugger.getTargets()).find(t => t.type === 'page' && t.url.startsWith('https://2gis.ru/'));
      if (!target) throw Error('2GIS target not found');
      return {id: target.tabId, url: target.url};
    });
    await worker.evaluate(tab => handleAction({...tab, url: 'https://example.com/'}), tab);
    assert.equal(await worker.evaluate(id => sessions.has(id), tab.id), false, 'Non-2GIS must be rejected');
    // Invoke exactly the registered action handler without automating browser chrome.
    await worker.evaluate(tab => handleAction(tab), tab);
    for (let n = 0; n < 120; n++) {
      const state = await worker.evaluate(id => ({error: sessions.get(id)?.error, workerError: sessions.get(id)?.workerError}), tab.id);
      if (n > 0 && n % 25 === 0) {await page.reload(); continue;}
      if (await page.evaluate(() => !!window.driftCarModel && !!window.driftCarRuntime?.getState().active && !!window.driftCameraClipping).catch(() => false)) break;
      if (n % 15 === 0) console.log('Preparing live map', n, state);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    const ready = await page.evaluate(() => ({model: !!window.driftCarModel, active: window.driftCarRuntime?.getState().active, bridge: window.driftStreamingBridge?.getState()}));
    assert(ready.model && ready.active && ready.bridge.chunks > 0, JSON.stringify(ready));
    console.log('READY', ready);

    await page.bringToFront();
    await page.waitForFunction(()=>window.driftProps?.getState().objects>0,{},{timeout:20000});
    console.log('FURNITURE STYLES',await page.evaluate(()=>{const m=mapgl._impl.modules.styleManager,out=[],seen=new WeakSet();function names(x){if(!x||typeof x!=='object')return [];if(x.input?.property==='db_sublayer')return (x.cases||[]).flatMap(c=>[...c.values]);return Object.values(x).filter(Array.isArray).flatMap(a=>a.flatMap(names));}function visit(x,d=0){if(!x||typeof x!=='object'||seen.has(x)||d>7)return;seen.add(x);if(x.type&&x.filter){const n=names(x.filter).filter(n=>/Lamppost|Bench_|round_bench|Swing_bench/.test(n));if(n.length)out.push({type:x.type,names:n});}if(x instanceof Map){for(const v of x.values())visit(v,d+1);return;}for(const [k,v]of Object.entries(x))if(!['modules','mapModules'].includes(k))visit(v,d+1);}visit(m.handyStylesMap);return out;}));
    console.log('PROPS',await page.evaluate(()=>driftProps.getState()));
    const selected=await page.evaluate(()=>{const r=driftCarRuntime,w=r.world;const candidates=[...driftProps.physics.bodies.values()].filter(b=>{const p=[b.position[0],b.position[1]-10];return !DriftVehicleCollision.inside(w,p)&&!DriftVehicleCollision.sweep(w,p,[b.position[0],b.position[1]+5]).blocked&&Math.abs((w.surfaceAt(p,Infinity)?.height||0)-b.baseHeight)<.3;});const body=candidates.sort((a,b)=>Math.hypot(...a.position.map((v,i)=>v-r.getState().position[i]))-Math.hypot(...b.position.map((v,i)=>v-r.getState().position[i])))[0];if(!body)throw Error('No unobstructed native prop');r.setPosition([body.position[0],body.position[1]-10]);r.setActive(true);mapgl.setCenter(w.toGeo(body.position),{duration:0});return {id:body.id,position:body.position,heading:r.getState().heading};});
    console.log('TARGET',selected);
    assert(Math.abs(selected.heading)<.01,'Expected northbound spawn');
    await page.waitForTimeout(500);
    await page.screenshot({path:path.resolve(__dirname,'../output/props-before.png')});
    await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',key:'w',bubbles:true})));
    try{await page.waitForFunction(id=>driftProps.physics.bodies.get(id)?.fallen,selected.id,{timeout:10000});}catch(e){console.log('FAILED STATE',await page.evaluate(id=>({car:driftCarRuntime.getState(),props:driftProps.getState(),body:driftProps.physics.bodies.get(id)}),selected.id));throw e;}
    await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',key:'w',bubbles:true})));
    console.log('HIT',await page.evaluate(id=>({body:driftProps.physics.bodies.get(id),car:driftCarRuntime.getState()}),selected.id));
    await page.waitForTimeout(2200);
    await page.screenshot({path:path.resolve(__dirname,'../output/props-after.png')});
    const result=await page.evaluate(id=>({body:driftProps.physics.bodies.get(id),props:driftProps.getState(),glError:mapgl.getWebGLContext().getError()}),selected.id);
    console.log('RESULT',result);assert(result.body.tilt>1.3,'Prop must fall');assert(!result.props.error);assert.equal(result.glError,0);
  }finally{await context.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});









