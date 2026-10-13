// Rounded 4.3 x 1.8 m body, sampled along its length. Both bumper positions
// sweep continuously, including the change of heading during a physics step.
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DriftVehicleCollision = api;
})(globalThis, () => {
  const samples = [-1.25, -.625, 0, .625, 1.25];
  const offset = (distance, heading, scale) => [Math.sin(heading) * distance * scale, Math.cos(heading) * distance * scale];
  function sweep(world, start, end, {heading = 0, startHeading = heading, scale = 1, radius = .9, height = 0, props} = {}) {
    let closest;
    for (const distance of samples) {
      const a = offset(distance, startHeading, scale), b = offset(distance, heading, scale);
      const from = start.map((v, i) => v + a[i]), to = end.map((v, i) => v + b[i]);
      let hit = world.sweep(from, to, radius * scale);
      const prop = props?.sweep(from, to, radius * scale, height);
      if (prop && (!hit.blocked || prop.fraction < hit.fraction)) hit = {
        blocked: true, reason: 'prop', fraction: prop.fraction, normal: prop.normal,
        position: prop.position, propId: prop.body.id
      };
      if (!hit.blocked) continue;
      const fraction = hit.fraction ?? 0;
      if (closest && fraction >= closest.fraction) continue;
      closest = {...hit, fraction, contact: hit.contact || hit.position.slice(),
        position: hit.position.map((v, i) => v - a[i] - (b[i] - a[i]) * fraction), bodyOffset: distance * scale};
    }
    return closest || {blocked: false, position: end.slice(), fraction: 1};
  }
  function inside(world, position, {heading = 0, scale = 1, radius = .9} = {}) {
    return samples.some(distance => {
      const delta = offset(distance, heading, scale), p = position.map((v, i) => v + delta[i]);
      return world.inside(p, radius * scale) || world.sweep(p, p, radius * scale).blocked;
    });
  }
  return {sweep, inside};
});
