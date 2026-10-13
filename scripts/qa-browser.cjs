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
    await worker.evaluate(() => checkUpdates());
    const notificationCheck = await worker.evaluate(async () => {
      const originalFetch = fetch;
      try {
        await chrome.storage.local.remove(['updateLastCheck', 'updateNotifiedVersion']);
        self.fetch = async (...args) => String(args[0]) === UPDATE_API
          ? new Response(JSON.stringify({tag_name: 'v0.1.2', html_url: 'https://github.com/MattShaddd/2gisdrift/releases/tag/v0.1.2', draft: false, prerelease: false}), {status: 200})
          : originalFetch(...args);
        await checkUpdates();
        const state = await chrome.storage.local.get(['updateAvailableVersion', 'updateNotifiedVersion']);
        const notices = await chrome.notifications.getAll();
        const alarm = await chrome.alarms.get('drift-release-check');
        return {state, notified: !!notices['drift-new-release'], period: alarm?.periodInMinutes};
      } finally {
        self.fetch = originalFetch;
        await chrome.notifications.clear('drift-new-release');
        await chrome.storage.local.remove(['updateLastCheck', 'updateNotifiedVersion', 'updateAvailableVersion']);
      }
    });
    console.log('NOTIFICATION STATE', notificationCheck);
    assert.equal(notificationCheck.state.updateAvailableVersion, '0.1.2');
    assert.equal(notificationCheck.state.updateNotifiedVersion, '0.1.2');
    assert.equal(notificationCheck.notified, true);
    assert.equal(notificationCheck.period, 15);
    console.log('NOTIFICATION PASS: real browser notification API and persistent alarm (simulated future release)');
    const page = context.pages()[0];
    await page.goto('https://2gis.ru/novosibirsk?m=82.945737%2C55.020442%2F19%2Fp%2F50');
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
      if (state.error) throw Error(JSON.stringify(state));
      if (await page.evaluate(() => !!window.driftCarModel && !!window.driftCarRuntime?.getState().active).catch(() => false)) break;
      if (n % 15 === 0) console.log('Preparing live map', n, state);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    const ready = await page.evaluate(() => ({model: !!window.driftCarModel, active: window.driftCarRuntime?.getState().active, bridge: window.driftStreamingBridge?.getState()}));
    assert(ready.model && ready.active && ready.bridge.chunks > 0, JSON.stringify(ready));
    console.log('READY', ready);
    assert.equal(await page.evaluate(() => mapgl.getWebGLContext().getError()), 0);
    const output = path.resolve(__dirname, '../output');
    fs.mkdirSync(output, {recursive: true});
    await page.screenshot({path: path.join(output, 'browser-ready.png')});
    await page.bringToFront();
    await page.mouse.click(950, 400);
    const before = await page.evaluate(() => driftCarRuntime.getState().geo);
    await page.keyboard.down('w');
    await new Promise(resolve => setTimeout(resolve, 2000));
    await page.keyboard.up('w');
    const after = await page.evaluate(() => driftCarRuntime.getState().geo);
    assert(Math.hypot(...after.map((v, i) => v - before[i])) > 1e-7, 'Car did not move');
    await page.keyboard.press('F8');
    assert.equal(await page.evaluate(() => driftCarRuntime.getState().active), false);
    await page.keyboard.press('F8');
    await page.keyboard.press('b');
    assert.equal(await page.evaluate(() => driftCarRuntime.getState().picking), true);
    await page.keyboard.press('Escape');
    await page.reload();
    await page.waitForFunction(() => !!window.driftCarModel && window.driftCarRuntime?.getState().active, null, {timeout: 120000});
    await worker.evaluate(tab => handleAction(tab), tab);
    await page.waitForFunction(() => !window.driftCarRuntime, null, {timeout: 30000});
    assert.equal(await worker.evaluate(id => sessions.has(id), tab.id), false);
    await worker.evaluate(tab => handleAction(tab), tab);
    await page.waitForFunction(() => !!window.driftCarModel && window.driftCarRuntime?.getState().active, null, {timeout: 120000});
    await page.goto('about:blank');
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(await worker.evaluate(id => sessions.has(id), tab.id), false, 'Leaving 2GIS must detach');
    console.log('PASS: host rejection, worker injection, model, GL, movement, pause, spawn, reload, stop, restart, detach on navigation');
  } finally {
    await context.close();
    // Profile is outside repository; keep it out of publication. Cleanup is left to OS temp maintenance.
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
