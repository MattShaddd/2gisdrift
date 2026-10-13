// Fetch release metadata only. Executable game files always come from the package.
const UPDATE_API = 'https://api.github.com/repos/MattShaddd/2gisdrift/releases/latest';
const UPDATE_ALARM = 'drift-release-check';
const UPDATE_NOTICE = 'drift-new-release';
const UPDATE_INTERVAL = 15 * 60 * 1000;
let updateRequest;
function versionParts(version) {
  if (typeof version !== 'string' || !/^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(version)) return null;
  return version.split('.').map(Number);
}
function newerVersion(remote, local) {
  const a = versionParts(remote), b = versionParts(local);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
function releaseVersion(data) {
  if (!data || data.draft !== false || data.prerelease !== false || typeof data.tag_name !== 'string') return null;
  const version = data.tag_name.startsWith('v') ? data.tag_name.slice(1) : '';
  if (!versionParts(version)) return null;
  const expected = `https://github.com/MattShaddd/2gisdrift/releases/tag/v${version}`;
  return data.html_url === expected ? version : null;
}
async function checkUpdates() {
  if (updateRequest) return updateRequest;
  updateRequest = (async () => {
    const state = await chrome.storage.local.get(['updateLastCheck', 'updateNotifiedVersion']);
    if (Number.isFinite(state.updateLastCheck) && Date.now() >= state.updateLastCheck && Date.now() - state.updateLastCheck < UPDATE_INTERVAL) return;
    // Failed checks also respect the interval; GitHub rate limits must not trigger retries on every click.
    await chrome.storage.local.set({updateLastCheck: Date.now()});
    const response = await fetch(UPDATE_API, {
      credentials: 'omit', cache: 'no-store', redirect: 'error',
      headers: {Accept: 'application/vnd.github+json'}, signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return;
    const version = releaseVersion(await response.json());
    if (!version || !newerVersion(version, chrome.runtime.getManifest().version)) {
      await chrome.storage.local.remove('updateAvailableVersion');
      await chrome.notifications.clear(UPDATE_NOTICE);
      return;
    }
    await chrome.storage.local.set({updateAvailableVersion: version});
    if (state.updateNotifiedVersion === version) return;
    if (await chrome.notifications.getPermissionLevel() !== 'granted') return;
    await chrome.notifications.create(UPDATE_NOTICE, {
      type: 'basic', iconUrl: 'icon128.png',
      title: `2GIS Drift: доступна версия ${version}`,
      message: 'Откройте релиз, скачайте ZIP и обновите расширение вручную.',
      buttons: [{title: 'Открыть релиз'}], silent: true
    });
    await chrome.storage.local.set({updateNotifiedVersion: version});
  })().catch(() => {
    // Network/OS notification failures must not interrupt the game or expose data.
  }).finally(() => { updateRequest = undefined; });
  return updateRequest;
}
async function openUpdateRelease(id) {
  if (id !== UPDATE_NOTICE) return;
  const {updateAvailableVersion: version} = await chrome.storage.local.get('updateAvailableVersion');
  if (!versionParts(version) || !newerVersion(version, chrome.runtime.getManifest().version)) return;
  await chrome.tabs.create({url: `https://github.com/MattShaddd/2gisdrift/releases/tag/v${version}`});
  await chrome.notifications.clear(UPDATE_NOTICE);
}
async function ensureUpdateAlarm() {
  if (!await chrome.alarms.get(UPDATE_ALARM)) await chrome.alarms.create(UPDATE_ALARM, {periodInMinutes: 15});
}
chrome.runtime.onInstalled.addListener(() => { ensureUpdateAlarm().catch(() => {}); checkUpdates(); });
chrome.runtime.onStartup.addListener(() => { ensureUpdateAlarm().catch(() => {}); checkUpdates(); });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === UPDATE_ALARM) checkUpdates(); });
chrome.notifications.onClicked.addListener(id => { openUpdateRelease(id).catch(() => {}); });
chrome.notifications.onButtonClicked.addListener((id, index) => { if (index === 0) openUpdateRelease(id).catch(() => {}); });
// Alarms may be cleared on restart; recreate on any service worker wake-up.
ensureUpdateAlarm().catch(() => {});
