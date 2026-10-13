const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
test('close camera keeps a short finite near plane, default views/globe unchanged, methods restored', () => {
  const camera = {state: {zoom: 23.43, center: [500, 500, 0], cameraConfig: {near: 1000, far: 1e10}}, position: [500, -1000, 550],
    restoreFixedNearFar() {this.state.cameraConfig.near = 1000;},
    updateNearFarState() {this.state.cameraConfig.near = 1000;},
    update() {this.restoreFixedNearFar();}
  };
  const original = camera.restoreFixedNearFar;
  const window = {mapgl: {_impl: {modules: {camera}}, triggerRerender() {}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/game/clipping.js'), 'utf8'), {window});
  assert(camera.state.cameraConfig.near > 1 && camera.state.cameraConfig.near < 40);
  assert.equal(camera.state.cameraConfig.far, 1e10);
  camera.position = new Float64Array([500, -1000, 550]); camera.updateNearFarState();
  assert(camera.state.cameraConfig.near < 40);
  camera.state.globeMode = true; camera.update(); assert.equal(camera.state.cameraConfig.near, 1000);
  camera.state.globeMode = false; camera.state.zoom = 18; camera.update(); assert.equal(camera.state.cameraConfig.near, 1000);
  camera.state.zoom = 23; camera.position = [NaN, 0, 0]; camera.update(); assert.equal(camera.state.cameraConfig.near, 1000);
  camera.position = [500, 500, 0]; camera.update(); assert.equal(camera.state.cameraConfig.near, 1000);
  window.driftCameraClipping.destroy(); assert.equal(camera.restoreFixedNearFar, original);
  assert.equal(camera.state.cameraConfig.near, 1000);
});
