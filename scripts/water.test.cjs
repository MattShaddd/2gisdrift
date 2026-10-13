const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
test('native water is extended, unrelated layers preserved, style reload handled and teardown restores', () => {
  const water = {type: 'polygon', maxzoom: 22, style: {textureImage: 'water'}};
  const road = {type: 'polygon', maxzoom: 22, style: {textureImage: 'road'}};
  const line = {type: 'line', maxzoom: 22, style: {textureImage: 'water'}};
  const unlimited = {type: 'polygon', maxzoom: Infinity, style: {textureImage: 'water'}};
  const lowZoom = {type: 'polygon', maxzoom: 12, style: {textureImage: 'water'}};
  let current = {layers: [water, road, line, unlimited, lowZoom]}, sync = 0, redraw = 0;
  const listeners = new Map();
  const map = {_impl: {modules: {
    camera: {state: {handyStyleId: 1}},
    styleManager: {getStyle: () => current},
    workers: {syncStyle: () => sync++}, tileManager: {redraw: () => redraw++}
  }}, on: (n, f) => listeners.set(n, f), off: n => listeners.delete(n), triggerRerender() {}};
  const window = {mapgl: map};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/game/water.js'), 'utf8'), {window});
  assert.equal(water.maxzoom, 24);
  assert.equal(road.maxzoom, 22); assert.equal(line.maxzoom, 22);
  assert.equal(unlimited.maxzoom, Infinity); assert.equal(lowZoom.maxzoom, 12);
  window.driftWaterVisibility.apply();
  assert.equal(sync, 1); assert.equal(redraw, 1);
  const next = {type: 'polygon', maxzoom: 22, style: {textureImage: {steps: [{value: 'water'}, {value: ''}]}}};
  current = {layers: [next]}; listeners.get('styleload')();
  assert.equal(next.maxzoom, 24);
  window.driftWaterVisibility.destroy();
  assert.equal(next.maxzoom, 22); assert.equal(water.maxzoom, 22);
  assert.equal(listeners.size, 0); assert.equal(redraw, 3);
});
