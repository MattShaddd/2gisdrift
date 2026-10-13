const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/game/world.js'),'utf8');
function setup(){const poly=(name,x,y,w,h,holes=[])=>({properties:{db_sublayer:name},geometry:{type:'Polygon',coordinates:[[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]],...holes]}});const native={sample:(world,p)=>p[0]>100?{height:5,id:'bridge',gradient:[0,0]}:{height:0,id:null,gradient:[0,0]}};const chunks=new Map([['a',{terrain:[poly('Water_area',-20,-20,80,80,[[[5,5],[10,5],[10,10],[5,10],[5,5]]]),poly('Main_Roadbed',30,-10,10,20),poly('Main_Roadbed',-10,65,20,10)]}]]);const context={window:{},DriftNativeRoadSurface:native,driftStreamingBridge:{chunks}};vm.runInNewContext(source.slice(source.indexOf('// Ground material'),source.indexOf('// Pick the visible')),context);return {native,api:context.window.DriftTerrainSurface,world:{toLocal:p=>p.slice(),toGeo:p=>p.slice()}};}
test('water polygon holes stay dry, native bridge deck overrides water',()=>{const {native,world}=setup();assert.equal(native.sample(world,[0,0]).material,'water');assert.equal(native.sample(world,[7,7]).material,'ground');assert.equal(native.sample(world,[101,0]).material,'road');assert.equal(native.sample(world,[101,0]).height,5);});
test('recovery chooses closest loaded dry road and rejects blocked candidates',()=>{const {api,world}=setup();const result=api.nearestRoad(world,[0,0],()=>true);assert(result);assert(result.distanceM<40);assert(result.position[0]>=30);const blocked=api.nearestRoad(world,[0,0],()=>false);assert.equal(blocked,undefined);});
test('roadbed over water is drivable while water beside it remains water',()=>{const {native,world}=setup();assert.equal(native.sample(world,[35,0],.35).material,'road');assert.equal(native.sample(world,[29,0],.35).material,'water');assert.equal(native.sample(world,[41,0],.35).material,'water');});
test('road priority is independent of polygon order and holes remain water',()=>{
 const rect=(name,holes=[])=>({properties:{db_sublayer:name},geometry:{type:'Polygon',coordinates:[[[0,0],[10,0],[10,10],[0,10],[0,0]],...holes]}});
 for(const reverse of [false,true]){
  const features=[rect('Main_Roadbed',[[[4,4],[6,4],[6,6],[4,6],[4,4]]]),rect('Water_area'),rect('Internal_lawn')];if(reverse)features.reverse();
  const native={sample:()=>({height:0,id:null,gradient:[0,0]})},context={window:{},DriftNativeRoadSurface:native,driftStreamingBridge:{chunks:new Map([['a',{terrain:features}]])}};
  vm.runInNewContext(source.slice(source.indexOf('// Ground material'),source.indexOf('// Pick the visible')),context);const world={toGeo:p=>p,toLocal:p=>p};
  assert.equal(native.sample(world,[2,2]).material,'road');assert.equal(native.sample(world,[5,5]).material,'water');
 }
});
