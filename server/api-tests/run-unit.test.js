'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {haversine,sequenceGaps,summarize,encodePolyline}=require('../src/runs/math');
const {ownerOrCanView}=require('../src/runs/access');
const start=new Date('2026-01-01T00:00:00Z');
const point=(seq,lat,sec,accuracyM=5)=>({seq,lat,lng:1,accuracyM,recordedAt:new Date(+start+sec*1000)});
const signals={segments:[{id:'segment',startedAt:start.toISOString(),endedAt:null}]};
test('GPS-02 known spherical distances, dateline crossing and stationary jitter are finite and bounded',()=>{
 assert.ok(Math.abs(haversine({lat:0,lng:1},{lat:.001,lng:1})-111.19508)<.001);
 assert.ok(haversine({lat:0,lng:179.999},{lat:0,lng:-179.999})<223);
 const result=summarize([point(0,0,0),point(1,.00001,1),point(2,.00002,2)],signals,start,new Date(+start+3000));assert.equal(result.distanceM,0);
});
test('GPS-01 cold start waits for <=25m or fifteen seconds while retaining poor fixes outside the distance total',()=>{
 const samples=[point(0,0,0,40),point(1,.001,10,40),point(2,.002,15,40),point(3,.0025,30,40)];const result=summarize(samples,signals,start,new Date(+start+30000));assert.equal(result.distanceM,56);assert.equal(samples.length,4);
});
test('GPS-03 drift outliers and accuracy above 50m do not inflate server distance or mutate raw points',()=>{
 const samples=[point(0,0,0),point(1,1,1),point(2,.001,20,100),point(3,.0001,25)];const copy=structuredClone(samples),result=summarize(samples,signals,start,new Date(+start+30000));assert.equal(result.distanceM,11);assert.deepEqual(result.outlierSeqs,[1]);assert.deepEqual(samples,copy);
});
test('GPS-04 gaps over thirty seconds or missing sequences never join route traces',()=>{
 const result=summarize([point(0,0,0),point(1,.001,31),point(3,.002,40)],signals,start,new Date(+start+40000));assert.equal(result.distanceM,0);assert.equal(result.routeSegments.length,3);assert.equal(result.gaps[0].interpolate,false);assert.deepEqual(sequenceGaps([2,3,6]),[{from:0,to:1},{from:4,to:5}]);
});
test('GPS-10 treadmill locations produce no distance and no invented route movement',()=>{assert.equal(summarize([point(0,0,0),point(1,0,10)],signals,start,new Date(+start+10000)).distanceM,0);assert.equal(encodePolyline([{lat:38.5,lng:-120.2},{lat:40.7,lng:-120.95},{lat:43.252,lng:-126.453}]),'_p~iF~ps|U_ulLnnqC_mqNvxq`@');});
test('PRIV-01 run owner-or-canView helper requires explicit shared scope and route permission; defaults to owner only',()=>{
 const owner={id:'one',privacy:{profileVisibility:'PUBLIC',hideRoute:false}},other={id:'two'};assert.equal(ownerOrCanView(owner,owner),true);assert.equal(ownerOrCanView(other,owner),false);assert.equal(ownerOrCanView(other,owner,{allowShared:true,includeRoute:true}),true);assert.equal(ownerOrCanView(other,{...owner,privacy:{...owner.privacy,hideRoute:true}},{allowShared:true,includeRoute:true}),false);
});

test('GPS-03 a long sequence of poor fixes never bridges the gap between accurate anchors',()=>{const samples=[point(0,0,0),...Array.from({length:39},(_,i)=>point(i+1,.0001,i+1,100)),point(40,.001,40)];const result=summarize(samples,signals,start,new Date(+start+41000));assert.equal(result.distanceM,0);assert.equal(result.routeSegments.length,2);assert.ok(result.gaps.some(g=>g.reason==='ACCURACY_GAP'));});

test('CHEAT-14 configuration rejects invalid minimum versions, retention and write limits without echoing values',()=>{const {readConfig}=require('../src/config');const env={DATABASE_URL:'postgresql://test:test@localhost/disposable',CORS_ORIGINS:'http://localhost:5173',JWT_ACCESS_SECRET:'test-access-secret-01234567890123456789',REFRESH_TOKEN_DERIVATION_SECRET:'test-derivation-secret-98765432109876543210'};for(const [name,value] of [['MIN_APP_VERSION','0'],['POINT_RETENTION_DAYS','-1'],['RUN_WRITE_LIMIT','no']])assert.throws(()=>readConfig({...env,[name]:value}),new RegExp(name));const config=readConfig(env);assert.equal(config.minAppVersion,6);assert.equal(config.pointRetentionDays,365);assert.equal(config.consentVersions.LOCATION,'2026-11-13-run-v1');});
