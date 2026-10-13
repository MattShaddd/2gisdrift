const {test} = require('node:test');
const assert = require('node:assert/strict');
const {transform, color, lighting, windows} = require('../src/game/night.js');
test('Night adaptation preserves geometry expressions, filters, selection and spacing', () => {
  const source = {icons: {window: {url: 'original.png'}}, light: {sources: {}, lightingModes: {}}, layers: [{type: 'group', layers: [
    {id:'house', type:'polygonExtrusion', filter:['get','building'], minzoom:16, style:{height:['get','height'], sideColor:['match',['get','selected'],[true],'#ff9387','#eeeeee'], sideTextures:[{image:'window',sliceSize:[3.5,2.5],wallPadding:[0,0,2,0]}]}},
    {id:'tree', type:'model', filter:['match',['get','db_sublayer'],['Model_tree_autumn'],true,false], style:{modelSrc:'tree',rotation:['get','angle']}},
    {id:'landmark', type:'model', style:{modelSrc:'theatre'}},
    {id:'mask', type:'polygon', drawToTarget:'mask', style:{color:'#ffffff'}}
  ]}]};
  const snapshot = JSON.stringify(source), result = transform(source), layers=result.style.layers[0].layers;
  assert.equal(JSON.stringify(source), snapshot, 'Original day style must remain untouched');
  assert.deepEqual(layers[0].filter,source.layers[0].layers[0].filter);
  assert.deepEqual(layers[0].style.height,['get','height']);
  const texture=layers[0].style.sideTextures[0];
  assert.deepEqual(texture.wallPadding,[0,0,2,0]);
  assert.equal(texture.sliceSize[0]/texture.horizontal.slicesCount,3.5/2);
  assert.equal(texture.sliceSize[1]/texture.vertical.slicesCount,2.5);
  assert.deepEqual(layers[0].style.sideColor.slice(0,3),['match',['get','selected'],[true]]);
  assert.equal(layers[0].minzoom,16);
  assert.match(result.style.icons.window.url,/^data:image\/svg\+xml;base64,/);
  assert.equal(layers[1].lightingMode,'driftNightModels');
  assert.equal(layers[2].lightingMode,'driftNightModels');
  assert.deepEqual(layers[1].style.rotation,['get','angle']);
  assert.equal(layers[3].style.color,'#ffffff','Render-target masks are data, not palette colors');
  assert.equal(result.windowLayers,1);assert.equal(result.modelLayers,2);assert.equal(result.treeLayers,1);
});
test('Window pattern is irregular, stable and seeded; panes have no frames or dividers', () => {
  const a=windows(7319), b=windows(9371);
  assert.deepEqual(a,windows(7319));
  assert.notDeepEqual(a.pattern,b.pattern);
  const lit=a.pattern.filter(Boolean).length;
  assert(lit>15&&lit<49,'Both lit and dark windows must be present');
  assert(new Set(Array.from({length:a.rows},(_,i)=>a.pattern.slice(i*a.columns,(i+1)*a.columns).join())).size>5,'Rows must not share an alternating pattern');
  assert(!/<path|stroke=|rx=/.test(a.svg));
  assert.match(a.svg,/feGaussianBlur/);
});
test('Alpha and style keywords survive; labels stay legible', () => {
  assert.match(color('#ffffff00'),/,0\)$/);
  assert.match(color('rgba(12,34,56,0.45)'),/,0.45\)$/);
  assert.equal(color('window'),'window');
  assert.equal(color('#fff'),color('#ffffff'));
  assert.equal(color('white'),color('#ffffff'));
  assert.match(color('#fff0'),/,0\)$/);
  assert.equal(color(5),5);
  assert(+color('#222222',true).match(/\d+/)[0]>140);
});
test('Host sun updates keep original modes and get bounded moon lighting', () => {
  const day={sources:{sun:{type:'directional',intensity:.14}},lightingModes:{global:['sun'],none:[]}};
  const night=lighting(day);
  assert.deepEqual(day.lightingModes.global,['sun']);
  assert.deepEqual(night.lightingModes.global,['sun']);
  assert.deepEqual(night.lightingModes.driftNightModels,['driftMoon','driftRim']);
  assert.equal(night.sources.driftMoon.intensity,.38);
});
