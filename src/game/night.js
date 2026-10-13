// Adapt the site's live style; no map data or third-party style is bundled.
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DriftNightStyle = api;
})(globalThis, () => {
  function color(value, text = false) {
    if (typeof value !== 'string') return value;
    value = ({white:'#ffffff', black:'#000000', transparent:'#00000000'})[value.toLowerCase()] || value;
    if (/^#[\da-f]{3,4}$/i.test(value)) value = '#' + [...value.slice(1)].map(c => c + c).join('');
    let rgba;
    const hex = value.match(/^#([\da-f]{6})([\da-f]{2})?$/i);
    const rgb = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
    if (hex) rgba = [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16)).concat(hex[2] ? parseInt(hex[2], 16) / 255 : 1);
    else if (rgb) rgba = [+rgb[1], +rgb[2], +rgb[3], rgb[4] === undefined ? 1 : +rgb[4]];
    else return value;
    const [r, g, b, a] = rgba, l = (r * .2126 + g * .7152 + b * .0722) / 255;
    // Cool charcoal surfaces; retain hue differences between parks and water.
    const base = text ? 140 + (1 - l) * 60 : 13 + l * 30;
    const out = text ? [base, base + 8, base + 16] : [base + (r - g) * .08, base + 7 + (g - r) * .08, base + 16 + (b - r) * .1];
    return `rgba(${out.map(v => Math.round(Math.max(0, Math.min(255, v)))).join(',')},${a})`;
  }
  function expression(value, text) {
    return Array.isArray(value) ? value.map(v => expression(v, text)) : color(value, text);
  }
  function lighting(original) {
    const light = JSON.parse(JSON.stringify(original));
    light.sources = {...light.sources,
      driftMoon: {type: 'ambient', color: '#8eabd8', intensity: .38},
      driftRim: {type: 'directional', color: '#b1c9ff', intensity: .09, altitude: 35, azimuth: 230}};
    light.lightingModes = {...light.lightingModes, driftNightModels: ['driftMoon', 'driftRim']};
    return light;
  }
  function windows(seed = 7319) {
    const columns = 8, rows = 8, cell = 64, pattern = [], shapes = [];
    let state = seed >>> 0;
    const random = () => {state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296;};
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      const lit = random() < .43, x = column * cell + 20, y = row * cell + 17;
      pattern.push(lit);
      if (lit) shapes.push(`<rect x="${x}" y="${y}" width="24" height="30" fill="#ffd28a" opacity=".24" filter="url(#glow)"/>`);
      shapes.push(`<rect x="${x}" y="${y}" width="24" height="30" fill="${lit ? '#ffe1a0' : '#142031'}"/>`);
    }
    // Seeded pattern is stable under camera movement and day/night toggling.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5"/></filter></defs>${shapes.join('')}</svg>`;
    return {svg, columns, rows, pattern};
  }
  function transform(original) {
    const style = JSON.parse(JSON.stringify(original));
    let windowLayers = 0, modelLayers = 0, treeLayers = 0;
    const textures = new Map();
    function walk(layers) {
      for (const layer of layers || []) {
        if (layer.layers) walk(layer.layers);
        const s = layer.style;
        if (!s || layer.drawToTarget) continue;
        // Daytime sun shadows have no place in this diffuse night scene.
        if (layer.castShadows) layer.castShadows = false;
        if (layer.receiveShadows) layer.receiveShadows = false;
        if (layer.type === 'model') {
          const tree = /tree|shrub|plant|bush|palm|fir|spruce/i.test(JSON.stringify([layer.filter, s.modelSrc]));
          layer.lightingMode = 'driftNightModels';
          modelLayers++;
          if (tree) treeLayers++;
        }
        for (const key of Object.keys(s)) {
          if (/color$/i.test(key)) s[key] = expression(s[key], /(?:text|icon)color$/i.test(key));
        }
        if (s.sideTextures?.some(t => /^window\d*$/i.test(t.image))) {
          for (const t of s.sideTextures) {
            if (!/^window\d*$/i.test(t.image)) continue;
            if (!textures.has(t.image)) {
              const seed = [...t.image].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0, 7319);
              const atlas = windows(seed);
              textures.set(t.image, atlas);
              style.icons[t.image] = {url: `data:image/svg+xml;base64,${typeof btoa === 'function' ? btoa(atlas.svg) : Buffer.from(atlas.svg).toString('base64')}`};
            }
            const atlas = textures.get(t.image);
            // Each old tile had two columns; expand the repeat area to an atlas
            // without enlarging the actual windows or their floor spacing.
            const size = t.sliceSize || [5, 2.5];
            t.sliceSize = [size[0] * atlas.columns / 2, size[1] * atlas.rows];
            t.horizontal = {...t.horizontal, slicesCount: atlas.columns};
            t.vertical = {...t.vertical, slicesCount: atlas.rows};
          }
          windowLayers++;
        }
      }
    }
    walk(style.layers);
    if (style.light) style.light = lighting(style.light);
    if (style.background) style.background.color = '#121c2b';
    if (style.environment) {
      style.environment.skyColor = '#080f24';
      style.environment.fogColor = '#18273d';
      style.environment.starsIntensity = .65;
    }
    return {style, windowLayers, modelLayers, treeLayers};
  }
  return {transform, color, lighting, windows};
});

(async () => {
  if (typeof window === 'undefined' || !window.mapgl || !window.DriftNightStyle) return;
  const previous = window.driftNightMode?.getSource?.();
  await window.driftNightMode?.destroy(false);
  const map = window.mapgl;
  let enabled = true, original, options, error, windowLayers = 0, modelLayers = 0, treeLayers = 0, applying = false, disposed = false;
  let queue = Promise.resolve();
  if (previous) {original = previous.original; options = previous.options;}
  try {enabled = localStorage.getItem('2gis-drift-night') !== 'off';} catch {}
  // The host updates sun azimuth after every style load. Preserve night modes.
  const lightingTarget = map._impl;
  const originalLighting = lightingTarget.setLightingStyle;
  function setLighting(light) {
    return originalLighting.call(this, enabled && !disposed ? DriftNightStyle.lighting(light) : light);
  }
  lightingTarget.setLightingStyle = setLighting;
  async function capture() {
    const id = map._impl?.state?.styleId;
    const entry = performance.getEntriesByType('resource').map(r => r.name).find(u => {
      try {const url = new URL(u); return url.hostname === 'styles.api.2gis.com' && url.pathname === `/styles/${id}`;} catch {return false;}
    });
    if (!entry) throw Error('Не найден исходный стиль карты');
    const response = await fetch(entry, {signal: AbortSignal.timeout(10000)});
    if (!response.ok) throw Error(`Стиль карты: ${response.status}`);
    const data = await response.json();
    if (!data.result?.layers || !data.result?.icons) throw Error('Формат стиля карты изменился');
    original = data.result;
    const state = map._impl.state;
    options = {rootUrl: location.origin, iconsPath: state.iconUrl, fontsPath: state.fontUrl, modelsPath: state.modelUrl};
  }
  async function apply() {
    if (disposed) return;
    applying = true;
    try {
      if (!original) await capture();
      if (disposed) return;
      const next = enabled ? DriftNightStyle.transform(original) : {style: original, windowLayers: 0, modelLayers: 0, treeLayers: 0};
      const state = {...map.getStyleState()};
      await map.setStyle(next.style, options);
      map.setStyleState(state);
      windowLayers = next.windowLayers;
      modelLayers = next.modelLayers;
      treeLayers = next.treeLayers;
      error = undefined;
    } catch (e) {error = String(e);}
    finally {applying = false;}
  }
  const schedule = () => queue = queue.then(apply);
  function onStyle() {
    if (applying || disposed) return;
    original = undefined;
    if (enabled) schedule();
  }
  function setEnabled(value) {
    enabled = !!value;
    try {localStorage.setItem('2gis-drift-night', enabled ? 'on' : 'off');} catch {}
    return schedule();
  }
  function key(event) {
    if (event.code !== 'F9' || event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    event.preventDefault();
    setEnabled(!enabled);
  }
  map.on('styleload', onStyle);
  document.addEventListener('keydown', key);
  window.driftNightMode = {
    setEnabled,
    getSource: () => original ? {original, options} : undefined,
    getState: () => ({enabled, windowLayers, modelLayers, treeLayers, applying, error}),
    async destroy(restore = true) {
      disposed = true;
      map.off('styleload', onStyle);
      document.removeEventListener('keydown', key);
      await queue;
      if (lightingTarget.setLightingStyle === setLighting) lightingTarget.setLightingStyle = originalLighting;
      if (restore && original && enabled) {const state = {...map.getStyleState()}; await map.setStyle(original, options); map.setStyleState(state);}
    }
  };
  window.driftNightMode.ready = enabled ? schedule() : Promise.resolve();
  await window.driftNightMode.ready;
})();
