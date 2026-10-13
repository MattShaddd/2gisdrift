// Only packaged source is evaluated. No remote executable updates.
importScripts('updates.js');
const sessions = new Map();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const allowed = url => {
  try { const u = new URL(url); return u.protocol === 'https:' && u.hostname === '2gis.ru'; }
  catch { return false; }
};
const command = (target, method, params = {}) => chrome.debugger.sendCommand(target, method, params);
async function evaluate(target, expression) {
  const result = await command(target, 'Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
const source = name => fetch(chrome.runtime.getURL(`game/${name}.js`)).then(r => {
  if (!r.ok) throw new Error(`Missing bundled ${name}`);
  return r.text();
});
async function status(tabId, text, title) {
  await chrome.action.setBadgeText({tabId, text}).catch(() => {});
  await chrome.action.setTitle({tabId, title: `2GIS Drift — ${title}`}).catch(() => {});
}
async function stop(tabId, reason, reload = true) {
  sessions.delete(tabId);
  if (reload) await command({tabId}, 'Page.reload').catch(() => {});
  await chrome.debugger.detach({tabId}).catch(() => {});
  await status(tabId, '', reason);
}
async function install(tabId, session) {
  if (session.installing) return;
  session.installing = true;
  const generation = session.generation;
  const target = {tabId};
  const valid = () => sessions.get(tabId) === session && session.generation === generation;
  const until = async predicate => {
    const deadline = Date.now() + 90000;
    while (valid() && Date.now() < deadline) {
      if (await evaluate(target, predicate)) return;
      await sleep(400);
    }
    throw new Error('Карта или столкновения не готовы. Нажмите значок для остановки, затем попробуйте снова.');
  };
  try {
    await until('!!window.mapgl?.getCanvas && !!window.mapgl?._impl?.modules?.workers');
    if (!valid()) return;
    await evaluate(target, await source('world') + '\n;void 0;');
    await evaluate(target, 'mapgl.setZoom(18,{duration:0});mapgl.setPitch(50,{duration:0});void 0;');
    await sleep(700);
    if (!valid()) return;
    await evaluate(target, 'mapgl.setZoom(21,{duration:0});void 0;');
    await until(`(()=>{const b=window.driftStreamingBridge,w=b?.world;if(!w||!b.chunks.size)return false;const p=w.toLocal(mapgl.getCenter());return w.sweep(p,p).reason!=='chunk-not-ready';})()`);
    if (!valid()) return;
    await evaluate(target, await source('car') + '\n;void 0;');
    await until('!!window.driftCarModel');
    if (!valid()) return;
    await evaluate(target, 'driftCarRuntime.setActive(true);void 0;');
    await status(tabId, 'ON', 'игра готова · нажмите для остановки');
  } catch (error) {
    if (valid()) {
      session.error = error.message;
      await status(tabId, 'ERR', error.message);
    }
  } finally {
    session.installing = false;
    if (sessions.get(tabId) === session && generation !== session.generation) install(tabId, session);
  }
}
async function handleAction(tab) {
  checkUpdates();
  if (!tab.id) return;
  if (sessions.has(tab.id)) { await stop(tab.id, 'остановлено · нажмите для запуска'); return; }
  if (!allowed(tab.url)) { await status(tab.id, '2GIS', 'откройте https://2gis.ru и нажмите значок'); return; }
  const session = {generation: 0, installing: false};
  sessions.set(tab.id, session);
  try {
    await chrome.debugger.attach({tabId: tab.id}, '1.3');
    await command({tabId: tab.id}, 'Page.enable');
    await command({tabId: tab.id}, 'Target.setAutoAttach', {autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: [{type: 'worker', exclude: false}]});
    await status(tab.id, '…', 'подготовка игры · нажмите для остановки');
    await command({tabId: tab.id}, 'Page.reload');
  } catch (error) {
    sessions.delete(tab.id);
    await chrome.debugger.detach({tabId: tab.id}).catch(() => {});
    await status(tab.id, 'ERR', error.message);
  }
}
chrome.action.onClicked.addListener(handleAction);
chrome.debugger.onEvent.addListener((parent, method, params) => {
  const session = sessions.get(parent.tabId);
  if (!session) return;
  if (method === 'Target.attachedToTarget') {
    const target = {tabId: parent.tabId, sessionId: params.sessionId};
    (async () => {
      try {
        await command(target, 'Runtime.runIfWaitingForDebugger');
        for (let attempt = 0; attempt < 240 && sessions.get(parent.tabId) === session; attempt++) {
          if (await evaluate(target, '!!self.sharedModule?.ZenithWorker')) {
            await evaluate(target, await source('worker') + '\n;void 0;');
            return;
          }
          await sleep(50);
        }
      } catch (error) { session.workerError = error.message; }
      finally { await command(target, 'Runtime.runIfWaitingForDebugger').catch(() => {}); }
    })();
  }
  if (method === 'Page.frameNavigated' && !params.frame.parentId) {
    session.generation++;
    if (!allowed(params.frame.url)) stop(parent.tabId, 'остановлено при уходе с 2GIS', false);
    else status(parent.tabId, '…', 'загрузка карты');
  }
  if (method === 'Page.loadEventFired') install(parent.tabId, session);
});
chrome.debugger.onDetach.addListener(async target => {
  sessions.delete(target.tabId);
  await chrome.action.setBadgeText({tabId: target.tabId, text: ''}).catch(() => {});
  // Manual debugger cancellation leaves the page runtime until the user reloads.
  // No automatic reattachment is attempted.
  await chrome.action.setTitle({tabId: target.tabId, title: '2GIS Drift — подключение закрыто; перезагрузите карту перед запуском'}).catch(() => {});
});
