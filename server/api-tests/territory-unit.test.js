'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const h3=require('h3-js');
const {routeCells,toIndex}=require('../src/territory/cells');
const {childRange,coveringRanges}=require('../src/territory/bbox');
const {evaluateRun}=require('../src/territory/claim');

const start=Date.parse('2026-11-20T10:00:00Z');
const fix=(seq,lat,lng,extra={})=>({seq,lat,lng,recordedAt:new Date(start+seq*1000),accuracyM:5,provider:'gps',isMock:false,...extra});

test('cells: fixes far apart in one segment are joined by a contiguous grid path with no repeats',()=>{
  const cells=routeCells([fix(0,19.076,72.8777),fix(1,19.077,72.8777)]);
  assert.ok(cells.length>=3);assert.equal(new Set(cells).size,cells.length);
  for(let i=1;i<cells.length;i++)assert.equal(h3.gridDistance(cells[i-1],cells[i]),1);
});
test('cells: a time/sequence gap, segment change or untrusted fix breaks the chain instead of inventing cells',()=>{
  const a=fix(0,19.076,72.8777),far=fix(1,19.077,72.8777);
  assert.equal(routeCells([a,{...far,seq:5}]).length,2,'sequence gap');
  assert.equal(routeCells([a,{...far,recordedAt:new Date(start+60000)}]).length,2,'time gap');
  assert.equal(routeCells([a,far],{pointMeta:{0:{segmentId:'x'},1:{segmentId:'y'}}}).length,2,'segment change');
  assert.equal(routeCells([a,{...far,accuracyM:80}]).length,1,'poor accuracy dropped');
  assert.equal(routeCells([a,{...far,provider:'network'}]).length,1,'network dropped');
  assert.equal(routeCells([a,{...far,isMock:true}]).length,1,'mock dropped');
  assert.equal(routeCells([a,far],{outlierSeqs:[1]}).length,1,'outlier dropped');
});
test('cells: returns a bounded unique set and BigInt indexes round-trip',()=>{
  const cells=routeCells([fix(0,19.076,72.8777),fix(1,19.076,72.8777)]);assert.equal(cells.length,1);
  assert.equal(BigInt(toIndex(cells[0])).toString(16),cells[0]);
});
test('bbox: all res-11 descendants of a res-7 cell fall in its contiguous index range and neighbours do not',()=>{
  const parent=h3.latLngToCell(19.076,72.8777,7),{min,max}=childRange(parent);
  const kids=h3.cellToChildren(parent,11).map(c=>BigInt('0x'+c));
  assert.ok(kids.every(k=>k>=min&&k<=max));
  for(const n of h3.gridRing(parent,1)){const o=h3.cellToChildren(n,11).map(c=>BigInt('0x'+c));assert.ok(o.every(k=>k<min||k>max));}
});
test('bbox: a covered map box includes the range of the cell at its centre',()=>{
  const cell=toIndex(h3.latLngToCell(19.076,72.8777,11));
  const ranges=coveringRanges({minLat:19.07,minLng:72.87,maxLat:19.08,maxLng:72.885});
  assert.ok(ranges.some(r=>cell>=r.min&&cell<=r.max));
});
test('anti-cheat rules flag mock data, impossible speed and repeated jumps only',()=>{
  const settings={max_speed_mps:8.5},run={mockGps:false};
  const base={run,points:[fix(0,1,1)],summary:{distanceM:1000,durationS:400,outlierSeqs:[]}};
  assert.deepEqual(evaluateRun(base,settings),[]);
  assert.deepEqual(evaluateRun({...base,run:{mockGps:true}},settings).map(r=>r.reason),['MOCK_LOCATION']);
  assert.deepEqual(evaluateRun({...base,points:[fix(0,1,1,{isMock:true})]},settings).map(r=>r.reason),['MOCK_LOCATION']);
  assert.deepEqual(evaluateRun({...base,summary:{...base.summary,durationS:100}},settings).map(r=>r.reason),['SPEED_LIMIT']);
  assert.deepEqual(evaluateRun({...base,summary:{...base.summary,outlierSeqs:[1,2]}},settings),[]);
  assert.deepEqual(evaluateRun({...base,summary:{...base.summary,outlierSeqs:[1,2,3]}},settings).map(r=>r.reason),['GPS_JUMP']);
});
test('bbox: every cell inside random map boxes (including parent-boundary clips) is covered',()=>{
  for(let n=0;n<30;n++){
    const minLat=-60+Math.random()*110,minLng=-170+Math.random()*340,box={minLat,minLng,maxLat:minLat+0.04+Math.random()*0.06,maxLng:minLng+0.04+Math.random()*0.06},ranges=coveringRanges(box);
    for(let k=0;k<150;k++){
      const cell=toIndex(h3.latLngToCell(box.minLat+Math.random()*(box.maxLat-box.minLat),box.minLng+Math.random()*(box.maxLng-box.minLng),11));
      assert.ok(ranges.some(r=>cell>=r.min&&cell<=r.max),'uncovered cell');
    }
  }
});
