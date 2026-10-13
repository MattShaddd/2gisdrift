const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const manifest = JSON.parse(read('extension/manifest.json'));
if (manifest.manifest_version !== 3 || manifest.minimum_chrome_version !== '125') throw Error('Unexpected manifest');
if (manifest.version !== JSON.parse(read('package.json')).version) throw Error('Version mismatch');
if (JSON.stringify(manifest.permissions) !== '["activeTab","debugger"]') throw Error('Unexpected permissions');
for (const p of ['extension/background.js', 'src/game/car.js', 'src/game/world.js', 'src/game/worker.js']) {
  new vm.Script(read(p), {filename: p});
}
for (const name of ['car.js', 'world.js', 'worker.js', 'ATTRIBUTION.txt', 'POLYGON-LICENSE.md']) {
  if (!fs.readFileSync(path.join(root, 'src/game', name)).equals(fs.readFileSync(path.join(root, 'extension/game', name)))) throw Error(`Stale bundle: ${name}`);
}
// Only print filenames/rule names. Never echo potential credentials.
const tracked = cp.execFileSync('git', ['ls-files', '-z'], {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean);
const candidates = tracked.length ? tracked : ['extension/background.js', 'extension/manifest.json', 'src/game/car.js', 'src/game/world.js', 'src/game/worker.js'];
const rules = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['GitHub credential', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['cloud access key', /\bAKIA[A-Z0-9]{16}\b/],
  ['API credential', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
  ['assigned credential', /(?:api[_-]?key|password|access[_-]?token|client[_-]?secret)\s*[:=]\s*["'][A-Za-z0-9_+/=-]{16,}["']/i]
];
for (const p of candidates) {
  if (/(?:^|\/)(?:node_modules|sources|research|output|dist|\.env|.*profile)(?:\/|$)|\.(?:har|geojson|dump|dmp|pem|key|pfx|exe|dll|log)$/i.test(p)) throw Error(`Forbidden publication file: ${p}`);
  const data = read(p);
  for (const [rule, pattern] of rules) if (pattern.test(data)) throw Error(`Review required: ${rule} in ${p}`);
}
console.log(`Syntax, MV3 permissions, bundle parity and publication scan OK (${candidates.length} files). Pattern scan cannot guarantee absence of every secret.`);
