const {test} = require('node:test');
const assert = require('node:assert/strict');
const {create} = require('../src/game/props.js');

test('continuous contact catches a narrow pole at high speed and respects elevation', () => {
  const p = create(); p.add('p', 'pole', [0, 0]);
  const hit = p.sweep([-5, 0], [5, 0], .9, 0);
  assert(hit); assert(Math.abs(hit.position[0] + 1.06) < 1e-9);
  assert.equal(p.sweep([-5, 2], [5, 2], .9, 0), undefined);
  assert.equal(p.sweep([-5, 0], [5, 0], .9, 10), undefined);
  assert.equal(p.sweep([-1, 0], [-5, 0], .9, 0), undefined);
});

test('impact conserves momentum, dissipates energy and modestly slows the car', () => {
  const p = create(), body = p.add('t', 'tree', [0, 0]);
  const hit = p.sweep([-4, 0], [4, 0], .9, 0), before = [20, 3];
  const {velocity, impulse} = p.impact(hit, before);
  assert(impulse > 0); assert(velocity[0] < 20 && velocity[0] > 17);
  assert.equal(velocity[1], 3);
  assert(Math.abs(1350 * velocity[0] + body.mass * body.velocity[0] - 1350 * 20) < 1e-8);
  assert(1350 * velocity[0] ** 2 + body.mass * body.velocity[0] ** 2 < 1350 * 20 ** 2);
  assert.equal(p.impact(hit, velocity).impulse, 0);
  assert.equal(p.sweep([-4, 0], [4, 0], .9, 0), undefined);
});

test('grazing impact preserves tangential momentum and produces a smaller penalty', () => {
  const p = create(); p.add('b', 'bench', [0, 0]);
  const hit = {body: p.bodies.get('b'), normal: [-1, 0]};
  const result = p.impact(hit, [1, 20]);
  assert.equal(result.velocity[1], 20);
  assert(Math.hypot(...result.velocity) > 19.99);
});

test('gravity tips each kind in the impact direction, friction stops it and it settles', () => {
  for (const kind of ['tree', 'bench', 'pole']) {
    const p = create(), body = p.add(kind, kind, [0, 0]);
    p.impact({body, normal: [0, -1]}, [0, 15]);
    for (let n = 0; n < 2400; n++) p.step(1 / 120);
    assert(body.sleeping, kind); assert.equal(body.tilt, Math.PI / 2);
    assert(body.position[1] > 0); assert.equal(body.position[0], 0);
    assert.deepEqual(body.velocity, [0, 0]);
  }
});
