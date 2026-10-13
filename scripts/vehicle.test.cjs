const {test} = require('node:test'), assert = require('node:assert/strict');
const vehicle = require('../src/game/vehicle.js');
const {create} = require('../src/game/props.js');
function plane(axis, boundary, sign = 1) {
  return {
    inside: (p, r) => sign * p[axis] + r > boundary,
    sweep(a, b, r) {
      const start = sign * a[axis] + r, end = sign * b[axis] + r;
      if (end <= boundary) return {blocked: false, position: b.slice(), fraction: 1};
      const fraction = start >= boundary ? 0 : (boundary - start) / (end - start);
      const normal = [0, 0]; normal[axis] = -sign;
      return {blocked: true, reason: 'wall', fraction, normal, position: a.map((v, i) => v + (b[i] - v) * fraction)};
    }
  };
}
test('front and rear bumpers stop before a wall; side clearance is the body width', () => {
  const front = vehicle.sweep(plane(1, 5), [0, 0], [0, 10]);
  assert(Math.abs(front.position[1] - 2.85) < 1e-8);
  assert.equal(front.bodyOffset, 1.25);
  const rear = vehicle.sweep(plane(1, 5, -1), [0, 0], [0, -10]);
  assert(Math.abs(rear.position[1] + 2.85) < 1e-8);
  assert.equal(rear.bodyOffset, -1.25);
  const side = vehicle.sweep(plane(0, 5), [0, 0], [10, 0]);
  assert(Math.abs(side.position[0] - 4.1) < 1e-8);
});
test('shape follows heading and scaling; rotation also sweeps bumper motion', () => {
  const hit = vehicle.sweep(plane(0, 5), [0, 0], [10, 0], {heading: Math.PI / 2});
  assert(Math.abs(hit.position[0] - 2.85) < 1e-8);
  const scaled = vehicle.sweep(plane(1, 5), [0, 0], [0, 10], {scale: 2});
  assert(Math.abs(scaled.position[1] - .7) < 1e-8);
  const rotation = vehicle.sweep(plane(0, 2), [0, 0], [0, 0], {startHeading: 0, heading: Math.PI / 2});
  assert(rotation.blocked); assert(rotation.fraction > 0 && rotation.fraction < 1);
  assert(Math.hypot(...rotation.position) < 1e-8);
});
test('recovery rejects a body whose bumper overlaps even when its centre is free', () => {
  assert(vehicle.inside(plane(1, 2), [0, 0]));
  assert(!vehicle.inside(plane(1, 2), [0, 0], {heading: Math.PI / 2}));
});
test('earliest car-body contact selects props or solid walls in the correct order', () => {
  const props = create(); props.add('tree', 'tree', [0, 4]);
  const beforeWall = vehicle.sweep(plane(1, 10), [0, 0], [0, 20], {props});
  assert.equal(beforeWall.reason, 'prop'); assert.equal(beforeWall.propId, 'tree');
  const behindWall = vehicle.sweep(plane(1, 3), [0, 0], [0, 20], {props});
  assert.equal(behindWall.reason, 'wall');
  props.bodies.get('tree').active = false;
  assert.equal(vehicle.sweep(plane(1, 10), [0, 0], [0, 20], {props}).reason, 'wall');
});

test('real car physics continues after breaking a prop and loses speed versus an empty path', () => {
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../src/game/car.js'), 'utf8');
  const context = {}; context.window = context;
  vm.runInNewContext(source.slice(0, source.indexOf('(() => {\n const previous=')), context);
  const results = [];
  for (const withProp of [false, true]) {
    const props = create(); if (withProp) props.add('tree', 'tree', [0, 0]);
    const motion = context.DriftCarMotion.create([0, -5]);
    motion.state.velocity = [0, 20]; motion.state.speed = 20;
    const empty = {sweep: (a, b) => ({blocked: false, position: b.slice(), fraction: 1})};
    const world = {surfaceAt: () => ({height: 0, gradient: [0, 0], id: null}),
      stepProps: dt => props.step(dt),
      sweep: (a, b) => vehicle.sweep(empty, a, b, {props, heading: motion.state.heading}),
      impactProp: (hit, velocity) => props.impact({body: props.bodies.get(hit.propId), normal: hit.normal}, velocity)};
    for (let n = 0; n < 60; n++) motion.step(new Set(), 1 / 120, world);
    assert(motion.state.position[1] > 0);
    assert(motion.state.speed > 10);
    if (withProp) assert(props.bodies.get('tree').fallen);
    results.push(motion.state.speed);
  }
  assert(results[1] < results[0]);
});
