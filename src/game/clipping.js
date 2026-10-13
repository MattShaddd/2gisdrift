// Adapt the native near plane to the short camera distance at driving zooms.
(() => {
  window.driftCameraClipping?.destroy();
  const map = window.mapgl, camera = map?._impl?.modules?.camera;
  if (!camera?.restoreFixedNearFar || !camera?.updateNearFarState) return;
  const originalFixed = camera.restoreFixedNearFar, originalDynamic = camera.updateNearFarState;
  function adapt() {
    const state = this.state;
    if (state.globeMode || state.zoom < 20 || (!Array.isArray(this.position) && !ArrayBuffer.isView(this.position))) return;
    const distance = Math.hypot(...Array.from(this.position, (v, i) => v - (state.center[i] || 0)));
    if (!Number.isFinite(distance) || distance <= 0) return;
    const config = state.cameraConfig;
    config.near = Math.max(1, Math.min(config.near, distance * 0.02));
  }
  const fixed = function (...args) { originalFixed.apply(this, args); adapt.call(this); };
  const dynamic = function (...args) { originalDynamic.apply(this, args); adapt.call(this); };
  camera.restoreFixedNearFar = fixed;
  camera.updateNearFarState = dynamic;
  window.driftCameraClipping = {
    getState: () => ({near: camera.state.cameraConfig.near, far: camera.state.cameraConfig.far}),
    destroy() {
      if (camera.restoreFixedNearFar === fixed) camera.restoreFixedNearFar = originalFixed;
      if (camera.updateNearFarState === dynamic) camera.updateNearFarState = originalDynamic;
      camera.update();
      map.triggerRerender();
    }
  };
  camera.update();
  map.triggerRerender();
})();
