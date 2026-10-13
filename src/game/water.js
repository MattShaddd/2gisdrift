// Preserve native water polygons beyond the default map's zoom-22 cutoff.
// Reuse the original geometry/material; do not draw a replacement water plane.
(() => {
  window.driftWaterVisibility?.destroy();
  const map = window.mapgl;
  const modules = map?._impl?.modules;
  if (!modules?.styleManager?.getStyle || !modules?.workers?.syncStyle || !modules?.tileManager?.redraw) return;
  const limit = 24; // Game camera currently tops out at zoom 23.43.
  const changed = new Map();
  let error;
  function refresh(style) {
    modules.workers.syncStyle(style);
    modules.tileManager.redraw();
    map.triggerRerender();
  }
  function apply() {
    try {
      const style = modules.styleManager.getStyle(modules.camera.state.handyStyleId);
      if (!style?.layers) return;
      let updated = false;
      for (const layer of style.layers) {
        // Native water materials also occur on the ocean background and pools.
        if (layer.type !== 'polygon' || !Number.isFinite(layer.maxzoom) || layer.maxzoom < 20 || layer.maxzoom >= limit) continue;
        if (!JSON.stringify(layer.style?.textureImage ?? '').includes('water')) continue;
        if (!changed.has(layer)) changed.set(layer, layer.maxzoom);
        layer.maxzoom = limit;
        updated = true;
      }
      if (updated) refresh(style);
      error = undefined;
    } catch (e) { error = String(e); }
  }
  map.on('styleload', apply);
  window.driftWaterVisibility = {
    apply,
    getState: () => ({patchedLayers: changed.size, maxzoom: limit, error}),
    destroy() {
      map.off('styleload', apply);
      const current = modules.styleManager.getStyle(modules.camera.state.handyStyleId);
      let restored = false;
      for (const [layer, original] of changed) {
        if (layer.maxzoom !== limit) continue;
        layer.maxzoom = original;
        if (current?.layers?.includes(layer)) restored = true;
      }
      changed.clear();
      if (restored) refresh(current);
    }
  };
  apply();
})();
