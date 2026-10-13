const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function harness() {
  const state = {}, notices = [], tabs = [], requests = [];
  let reply = {ok: true, json: async () => ({tag_name: 'v0.1.2', html_url: 'https://github.com/MattShaddd/2gisdrift/releases/tag/v0.1.2', draft: false, prerelease: false})};
  const event = () => ({addListener() {}});
  const context = vm.createContext({AbortSignal, Date, console, fetch: async (...args) => {requests.push(args); if (reply instanceof Error) throw reply; return reply;}, chrome: {
    runtime: {getManifest: () => ({version: '0.1.1'}), getURL: x => 'chrome-extension://test/' + x, onInstalled: event(), onStartup: event()},
    storage: {local: {get: async () => ({...state}), set: async x => Object.assign(state, x), remove: async key => {delete state[key];}}},
    notifications: {getPermissionLevel: async () => 'granted', create: async (id, options) => notices.push({id, ...options}), clear: async () => {}, onClicked: event(), onButtonClicked: event()},
    alarms: {get: async () => ({}), create: async () => {}, onAlarm: event()},
    tabs: {create: async x => tabs.push(x)}
  }});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../extension/updates.js'), 'utf8'), context);
  return {context, state, notices, tabs, requests, reply: x => {reply = x;}, run: code => vm.runInContext(code, context)};
}
test('new release notifies once, throttles checks and opens only canonical release', async () => {
  const h = harness();
  await Promise.all([h.run('checkUpdates()'), h.run('checkUpdates()')]);
  assert.equal(h.requests.length, 1);
  assert.equal(h.notices.length, 1);
  assert.equal(h.state.updateAvailableVersion, '0.1.2');
  await h.run('checkUpdates()');
  assert.equal(h.requests.length, 1);
  h.state.updateLastCheck = 0;
  await h.run('checkUpdates()');
  assert.equal(h.notices.length, 1);
  await h.run("openUpdateRelease('other')");
  assert.equal(h.tabs.length, 0);
  await h.run("openUpdateRelease('drift-new-release')");
  assert.equal(h.tabs[0].url, 'https://github.com/MattShaddd/2gisdrift/releases/tag/v0.1.2');
  h.state.updateAvailableVersion = '0.1.2/../../evil';
  await h.run("openUpdateRelease('drift-new-release')");
  assert.equal(h.tabs.length, 1);
});
test('Worker activation checks releases without installation or browser-start events', async () => {
  const h=harness();
  await h.run('updateRequest');
  assert.equal(h.requests.length,1);
  assert.equal(h.state.updateAvailableVersion,'0.1.2');
  await h.run('checkUpdates()');
  assert.equal(h.requests.length,1,'Action immediately after activation must reuse the interval');
});
test('version ordering and malformed, draft, prerelease, redirected release metadata', () => {
  const h = harness();
  assert(h.run("newerVersion('0.10.0', '0.9.9')"));
  assert.equal(h.run("newerVersion('0.1.1', '0.1.1')"), false);
  assert.equal(h.run("newerVersion('0.1.0', '0.1.1')"), false);
  for (const extra of [{prerelease: true}, {draft: true}, {tag_name: 'v0.1.2-beta'}, {html_url: 'https://evil.example/'}, {tag_name: '../evil'}]) {
    h.context.metadata = {...{tag_name: 'v0.1.2', html_url: 'https://github.com/MattShaddd/2gisdrift/releases/tag/v0.1.2', draft: false, prerelease: false}, ...extra};
    assert.equal(h.run('releaseVersion(metadata)'), null);
  }
});
test('current version stays quiet; rate limiting, offline and invalid JSON are harmless', async () => {
  for (const reply of [{ok: false, status: 403}, new Error('offline'), {ok: true, json: async () => {throw Error('JSON');}}, {ok: true, json: async () => ({draft: false, prerelease: false, tag_name: 'v0.1.1', html_url: 'https://github.com/MattShaddd/2gisdrift/releases/tag/v0.1.1'})}]) {
    const h = harness(); h.reply(reply);
    await h.run('checkUpdates()'); await h.run('checkUpdates()');
    assert.equal(h.notices.length, 0);
    assert.equal(h.requests.length, 1);
  }
});
