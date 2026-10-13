// Breakaway street furniture. Metres, kilograms and seconds; deterministic fixed steps.
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DriftPropPhysics = api;
})(globalThis, () => {
  const kinds = {
    tree: {mass: 110, radius: .28, height: 6, friction: .65},
    bench: {mass: 65, radius: .75, height: .9, friction: .55},
    pole: {mass: 85, radius: .16, height: 5, friction: .45}
  };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function create() {
    const bodies = new Map();
    function add(id, kind, position, height = 0, dimensions = {}) {
      if (bodies.has(id)) return bodies.get(id);
      const config = kinds[kind];
      if (!config || !position.every(Number.isFinite)) return;
      const body = {id, kind, ...config, ...dimensions, position: position.slice(),
        baseHeight: height, velocity: [0, 0], tilt: 0, omega: 0,
        direction: [0, 1], yaw: 0, spin: 0, fallen: false, sleeping: false};
      bodies.set(id, body);
      return body;
    }
    function sweep(start, end, radius, height) {
      const delta = end.map((v, i) => v - start[i]), length2 = delta[0] ** 2 + delta[1] ** 2;
      if (length2 < 1e-14) return;
      let result;
      for (const body of bodies.values()) {
        if (body.active === false || body.fallen || height > body.baseHeight + body.height || height + 1 < body.baseHeight) continue;
        const p = start.map((v, i) => v - body.position[i]), r = radius + body.radius;
        const b = p[0] * delta[0] + p[1] * delta[1], c = p[0] ** 2 + p[1] ** 2 - r * r;
        const discriminant = b * b - length2 * c;
        if (discriminant < 0) continue;
        const fraction = c <= 0 ? 0 : (-b - Math.sqrt(discriminant)) / length2;
        if (fraction < 0 || fraction > 1 || (result && fraction >= result.fraction)) continue;
        const contact = start.map((v, i) => v + delta[i] * fraction);
        let n = contact.map((v, i) => v - body.position[i]), norm = Math.hypot(...n);
        if (norm < 1e-8) {norm = Math.sqrt(length2); n = delta.map(v => -v);}
        const normal = n.map(v => v / norm);
        if (delta[0] * normal[0] + delta[1] * normal[1] >= 0) continue;
        result = {body, fraction, normal, position: contact};
      }
      return result;
    }
    function impact(hit, velocity, carMass = 1350) {
      const body = hit.body, n = hit.normal;
      if (body.fallen) return {velocity: velocity.slice(), impulse: 0};
      const closing = Math.max(0, -(velocity[0] * n[0] + velocity[1] * n[1]));
      if (closing < .05) return {velocity: velocity.slice(), impulse: 0};
      // Inelastic impact conserves momentum and removes energy. Breakaway mount
      // makes a direct strike pass through while tangential momentum is preserved.
      const impulse = closing / (1 / carMass + 1 / body.mass);
      const next = velocity.map((v, i) => v + impulse / carMass * n[i]);
      body.velocity = n.map(v => -v * impulse / body.mass);
      body.direction = n.map(v => -v);
      const arm = Math.min(.65, body.height * .5), inertia = body.mass * body.height ** 2 / 3;
      body.omega = impulse * arm / inertia;
      body.tilt = .015;
      body.fallen = true;
      const tangent = velocity[0] * n[1] - velocity[1] * n[0];
      body.spin = clamp(tangent / Math.max(1, body.height) * .15, -2, 2);
      return {velocity: next, impulse};
    }
    function step(dt) {
      dt = clamp(dt, 0, .05);
      for (const body of bodies.values()) {
        if (!body.fallen || body.sleeping) continue;
        body.omega += 3 * 9.81 / (2 * body.height) * Math.sin(body.tilt) * dt;
        body.tilt += body.omega * dt;
        if (body.tilt > Math.PI / 2) {
          body.tilt = Math.PI / 2;
          body.omega = Math.abs(body.omega) > .15 ? -body.omega * .12 : 0;
        }
        const speed = Math.hypot(...body.velocity), next = Math.max(0, speed - body.friction * 9.81 * dt);
        body.position = body.position.map((v, i) => v + body.velocity[i] * dt * (speed ? (1 + next / speed) * .5 : 0));
        body.velocity = body.velocity.map(v => speed ? v * next / speed : 0);
        body.yaw += body.spin * dt;
        body.spin *= Math.exp(-4 * dt);
        if (next < .01 && Math.abs(body.omega) < .01 && body.tilt > 1.56) {
          body.sleeping = true; body.velocity = [0, 0]; body.spin = 0; body.omega = 0; body.tilt = Math.PI / 2;
        }
      }
    }
    return {bodies, add, sweep, impact, step};
  }
  return {create, kinds};
});

// Change the native instance transform, so lighting, textures and shadows remain
// those of the map. Only supported, explicitly named street furniture is touched.
(() => {
  if (typeof window === 'undefined' || !window.mapgl || !window.DriftPropPhysics) return;
  window.driftProps?.destroy();
  const map = window.mapgl, gl = map.getWebGLContext(), physics = DriftPropPhysics.create();
  const bindings = new Set(), seen = new WeakMap();
  let currentWorld, lastScan = -Infinity, error;
  function kindOf(filter) {
    if (!filter || typeof filter !== 'object') return;
    if (filter.input?.property === 'db_sublayer') {
      for (const c of filter.cases || []) {
        if (c.output !== true || !c.values?.[Symbol.iterator]) continue;
        for (const name of c.values) {
          if (/^Model_tree_(?!shrubs)/i.test(name)) return 'tree';
          if (/^(?:Bench_|Large_round_bench_|Small_round_bench_|Swing_bench_)/i.test(name)) return 'bench';
          if (/^(?:Lamppost_|Model_(?:lamp|pole)_)/i.test(name)) return 'pole';
        }
      }
    }
    for (const value of Object.values(filter)) {
      if (Array.isArray(value)) {for (const child of value) {const kind = kindOf(child); if (kind) return kind;}}
    }
  }
  const fromMercator = (x, y) => [x / 2147483648 * 180, (2 * Math.atan(Math.exp(y / (2147483648 / Math.PI))) - Math.PI / 2) * 180 / Math.PI];
  function scan() {
    const world = window.driftCarRuntime?.world;
    if (!world) return;
    if (currentWorld && currentWorld !== world) {
      for (const b of physics.bodies.values()) b.position = world.toLocal(currentWorld.toGeo(b.position));
    }
    currentWorld = world;
    const scene = map._impl?.modules?.modelsScene, styles = map._impl?.modules?.styleManager;
    if (!scene || !styles) return;
    const old = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
    try {
      for (const object of scene.sceneObjects.values()) {
        const kind = kindOf(styles.getStyleLayer(object.attributes.styleId, object.attributes.layerId)?.filter);
        if (!kind || object.tile.isDestroyed) continue;
        const a = object.vao?._attributes, pos = a?.a_vec3_instance_position, matrix = a?.a_mat3_instance_matrix;
        const buffer = pos?._buffer;
        if (!buffer?._glBuffer || matrix?._buffer !== buffer || pos.options.stride !== 64 || matrix.options.offset !== 8 || seen.has(buffer)) continue;
        const M = object.tile.renderModelMatrix;
        if (!M || !M[0] || !M[5] || !M[10] || object.instanceCount * 64 > buffer.byteLength) continue;
        const bytes = new Uint8Array(buffer.byteLength);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer._glBuffer);
        gl.getBufferSubData(gl.ARRAY_BUFFER, 0, bytes);
        const native = new DataView(bytes.buffer), list = [];
        for (let i = 0; i < object.instanceCount; i++) {
          const offset = i * 64, x = M[12] + native.getUint16(offset, true) / 65535 * M[0], y = M[13] + native.getUint16(offset + 2, true) / 65535 * M[5];
          const geo = fromMercator(x, y), p = world.toLocal(geo), id = `${kind}:${geo.map(v => v.toFixed(7)).join(':')}`;
          const ground = world.surfaceAt?.(p, Infinity)?.height || 0;
          const body = physics.add(id, kind, p, ground);
          const record = {body, buffer, tile: object.tile, offset, original: bytes.slice(offset, offset + 64), M: Array.from(M), x, y, world, written: false};
          bindings.add(record); list.push(record);
        }
        seen.set(buffer, list);
      }
      // Keep fallen state across LOD/tile replacement, but bound travel history.
      for (const record of bindings) if (record.tile.isDestroyed) bindings.delete(record);
      const present = new Set([...bindings].map(r => r.body.id));
      for (const body of physics.bodies.values()) body.active = present.has(body.id);
      for (const [id, body] of physics.bodies) if (!present.has(id) && Math.hypot(body.position[0] - world.toLocal(map.getCenter())[0], body.position[1] - world.toLocal(map.getCenter())[1]) > 1500) physics.bodies.delete(id);
      error = undefined;
    } catch (e) {error = String(e);}
    finally {gl.bindBuffer(gl.ARRAY_BUFFER, old);}
  }
  function render() {
    const time = performance.now();
    if (time - lastScan > 500) {scan(); lastScan = time;}
    const old = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
    try {
      for (const record of bindings) {
        const b = record.body;
        if (!b.fallen || record.tile.isDestroyed || (b.sleeping && record.written)) continue;
        const bytes = record.original.slice(), view = new DataView(bytes.buffer), geo = currentWorld.toGeo(b.position), lat = geo[1] * Math.PI / 180, k = 2147483648 / Math.PI;
        const x = geo[0] / 180 * 2147483648, y = Math.log(Math.tan(Math.PI / 4 + lat / 2)) * k;
        const px = (x - record.M[12]) / record.M[0] * 65535, py = (y - record.M[13]) / record.M[5] * 65535;
        // Native instances have a half-tile margin; do not wrap uint16 positions.
        view.setUint16(0, Math.max(0, Math.min(65535, Math.round(px))), true);
        view.setUint16(2, Math.max(0, Math.min(65535, Math.round(py))), true);
        const dx = b.direction[0], dy = b.direction[1], c = Math.cos(b.tilt), s = Math.sin(b.tilt), cy = Math.cos(b.yaw), sy = Math.sin(b.yaw);
        for (let col = 0; col < 3; col++) {
          const offset = 8 + col * 12, a = new DataView(record.original.buffer, record.original.byteOffset);
          const vx = a.getFloat32(offset, true), vy = a.getFloat32(offset + 4, true), vz = a.getFloat32(offset + 8, true), along = dx * vx + dy * vy;
          const X = vx + dx * ((c - 1) * along + s * vz), Y = vy + dy * ((c - 1) * along + s * vz), Z = c * vz - s * along;
          view.setFloat32(offset, cy * X - sy * Y, true); view.setFloat32(offset + 4, sy * X + cy * Y, true); view.setFloat32(offset + 8, Z, true);
        }
        // Raise the resting trunk/seat above the ground rather than burying it.
        const units = k / (6378137 * Math.cos(lat));
        view.setFloat32(48, view.getFloat32(48, true) + Math.min(b.radius, .3) * Math.sin(b.tilt) * units / record.M[10], true);
        gl.bindBuffer(gl.ARRAY_BUFFER, record.buffer._glBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, record.offset, bytes);
        record.written = b.sleeping;
      }
    } finally {gl.bindBuffer(gl.ARRAY_BUFFER, old);}
  }
  const id = 'drift-breakaway-props';
  map.addLayer({id, type: 'custom', render});
  window.driftProps = {
    physics, scan,
    sweep(start, end, radius, height) {return physics.sweep(start, end, radius, height);},
    impact(hit, velocity) {return physics.impact(hit, velocity);},
    step(dt) {physics.step(dt);},
    getState: () => ({objects: physics.bodies.size, bindings: bindings.size, fallen: [...physics.bodies.values()].filter(b => b.fallen).length, error}),
    destroy() {
      const old = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
      try {for (const r of bindings) if (!r.tile.isDestroyed && r.body.fallen) {gl.bindBuffer(gl.ARRAY_BUFFER, r.buffer._glBuffer);gl.bufferSubData(gl.ARRAY_BUFFER, r.offset, r.original);}}
      finally {gl.bindBuffer(gl.ARRAY_BUFFER, old);}
      if (map.hasLayer(id)) map.removeLayer(id);
      bindings.clear(); physics.bodies.clear();
    }
  };
  scan();
})();
