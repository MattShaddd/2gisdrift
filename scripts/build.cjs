const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src/game');
const target = path.join(root, 'extension/game');
fs.mkdirSync(target, {recursive: true});
for (const name of ['worker.js', 'world.js', 'car.js', 'ATTRIBUTION.txt', 'POLYGON-LICENSE.md']) {
  fs.copyFileSync(path.join(source, name), path.join(target, name));
}
console.log('Extension ready: extension/');
