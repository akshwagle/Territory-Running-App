'use strict';
const {createHash}=require('node:crypto');
const {Prisma}=require('@prisma/client');
const h3=require('h3-js');
const {currentAccount,lockAccountWork,publicError}=require('../profile/common');
const {databaseNow}=require('../auth/session-core');
const {createConsentService,consentSummary,locationAcceptedAt}=require('../profile/consents');
const {ownerOrCanView}=require('./access');
const {haversine,sequenceGaps,summarize}=require('./math');
const {id:uuid}=require('./validation');
const fail=(status,code,message)=>{throw publicError(status,code,message);};
const stable=value=>value instanceof Date?value.toISOString():Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const digest=value=>createHash('sha256').update(JSON.stringify(stable(value))??'null').digest('hex');
function dto(row){return {id:row.id,clientRunId:row.clientRunId,startedAt:row.startedAt,endedAt:row.endedAt,distanceM:row.distanceM,durationS:row.durationS,
  mockGps:!!row.mockGps,status:row.status,state:row.status==='ACTIVE'?(row.runSignals.recordingState||'ACTIVE'):'DONE',createdAt:row.createdAt,
  paceSecondsPerKm:row.distanceM>0&&row.durationS!==null?Math.round(row.durationS*1000/row.distanceM):null,
  informationalReviews:row.runSignals.summary?.reviews||[],restricted:!!row.runSignals.summary?.restricted,region:row.runSignals.summary?.region||null,
  sequenceGaps:row.runSignals.sequenceGaps||[],routeSegments:row.runSignals.summary?.routeSegments||[]};}
function createRunService({prisma,config}){
  const consent=createConsentService({prisma,config});
  async function transaction(req,task){return prisma.$transaction(async tx=>{await lockAccountWork(tx,req.authUser.id);const user=await currentAccount(tx,req);return task(tx,user,await databaseNow(tx));},{timeout:30000,maxWait:15000});}
  async function owned(tx,user,id,{deleted=false}={}){
    await tx.$queryRaw`SELECT id FROM runs WHERE id=${id}::uuid AND user_id=${user.id}::uuid FOR UPDATE`;
    const row=await tx.run.findFirst({where:{id,userId:user.id,...(!deleted?{deletedAt:null}:{})}});
    if(!row||!ownerOrCanView(user,user,{includeRoute:true}))fail(404,'NOT_FOUND','This run was not found.');return row;
  }
  function installer(req,row){if(row.status==='ACTIVE'&&req.get('x-install-id')!==row.runSignals.device?.installId)fail(409,'RUN_ACTIVE_ELSEWHERE','This run is recording on another installation. Wait ten minutes without new points before ending it here.');}
  function windowCheck(row,time,now){const stamp=+new Date(time);if(stamp>+now)fail(400,'FUTURE_TIMESTAMP','A recording time is ahead of the server clock.');
    if(stamp<+row.startedAt||(row.endedAt&&stamp>+row.endedAt))fail(400,'OUTSIDE_RUN_WINDOW','A recording time is outside this run.');
    if(stamp-+row.startedAt>86400000)fail(400,'RUN_TOO_LONG','A run can last at most 24 hours.');}
  async function history(tx,userId){return tx.userConsent.findMany({where:{userId},orderBy:{id:'desc'}});}
  function acceptedAt(rows,time,versions){const stamp=+new Date(time);return locationAcceptedAt(rows,time,versions.LOCATION)&&consentSummary(rows.filter(r=>+r.createdAt<=stamp),versions).every(r=>r.accepted);}
  function requirePastConsent(rows,row,time){if(!acceptedAt(rows,time,row.runSignals.consentVersions||config.consentVersions))fail(409,'CONSENT_REQUIRED','Only points recorded under accepted location, terms and privacy notices can be uploaded.');}
  function mergeEvents(signals,events,row,now){const existing=new Map((signals.events||[]).map(e=>[e.id,e]));for(const event of events){windowCheck(row,event.recordedAt,now);const value=stable(event),prior=existing.get(value.id);if(prior&&digest(prior)!==digest(value))fail(409,'IDEMPOTENCY_CONFLICT','An event identifier was reused with different details.');existing.set(value.id,value);}if(existing.size>100000)fail(409,'RUN_SIGNAL_LIMIT','This run has reached its event limit. Finish it before recording more.');return [...existing.values()];}
  function manualPause(segment,controls){return (segment.pauseReason||controls.findLast(c=>c.action==='pause')?.reason)==='USER';}
  function pausedDistance(from,to){
    if(!from||!to||[from,to].some(p=>p.accuracyM!==undefined&&p.accuracyM>50))return 0;
    const distance=haversine(from,to);return distance>100?distance:0;
  }
  async function highest(tx,runId){const aggregate=await tx.runPoint.aggregate({where:{runId},_max:{seq:true}});return aggregate._max.seq??-1;}
  async function create(req,input){return transaction(req,async(tx,user,now)=>{
    const existing=await tx.run.findUnique({where:{userId_clientRunId:{userId:user.id,clientRunId:input.clientRunId}}});
    if(existing){if(existing.deletedAt)fail(410,'RUN_DELETED','This run was discarded. Start a new run.');if(existing.runSignals.device?.installId!==input.device.installId)fail(409,'IDEMPOTENCY_CONFLICT','This recording identifier belongs to a different installation.');return {created:false,run:dto(existing),serverTime:now};}
    const permission=await consent.recordingPermission(tx,user.id);if(!permission.allowed)fail(409,'CONSENT_REQUIRED','Read and accept the current location, terms and privacy notices before recording.');
    if(config.requireVerifiedEmailForRuns&&!user.verifiedAt)fail(403,'EMAIL_VERIFICATION_REQUIRED','Verify your email before starting a run.');
    if(+input.startedAt>+now||+now-+input.startedAt>300000)fail(400,'CLOCK_OUT_OF_SYNC','Check your phone clock and try starting again.');
    if(await tx.run.findFirst({where:{userId:user.id,status:'ACTIVE',deletedAt:null},select:{id:true}}))fail(409,'RUN_ACTIVE_ELSEWHERE','A run is already active. Resume it, cancel this start, or end it after ten minutes without new points.');
    const run=await tx.run.create({data:{userId:user.id,clientRunId:input.clientRunId,startedAt:input.startedAt,endedAt:null,durationS:null,distanceM:0,status:'ACTIVE',appVersion:input.device.appVersion,
      runSignals:{version:1,device:input.device,consentVersions:config.consentVersions,recordingState:'ACTIVE',segments:[{id:input.clientRunId,startedAt:input.startedAt.toISOString(),endedAt:null}],controls:[],events:[],pointMeta:{},batches:{},sequenceGaps:[]}}});
    return {created:true,run:dto(run),serverTime:now};
  });}
  async function points(req,id,input){return transaction(req,async(tx,user,now)=>{
    const row=await owned(tx,user,id);installer(req,row);const signals=row.runSignals,ordered=[...input.points].sort((a,b)=>a.seq-b.seq);
    if(new Set(ordered.map(p=>p.seq)).size!==ordered.length)fail(400,'DUPLICATE_SEQUENCE','A batch must contain each sequence number only once.');
    if(input.batchKey!==`${id}:${ordered[0].seq}`)fail(400,'INVALID_BATCH_KEY','Use the run ID and first sequence number as the batch key.');
    const hash=digest({...input,points:ordered}),receipt=signals.batches?.[input.batchKey];
    if(receipt){if(receipt.digest!==hash)fail(409,'IDEMPOTENCY_CONFLICT','This batch key was reused with different points.');return {highestSeq:await highest(tx,id),duplicate:true,recordingAllowed:(await consent.recordingPermission(tx,user.id)).allowed};}
    if(row.status!=='ACTIVE')fail(409,'RUN_FINISHED','This run is already finished. Its saved result cannot change.');
    const rows=await history(tx,user.id),meta={...signals.pointMeta},segments=structuredClone(signals.segments||[]);let pausedMovement=[...(signals.pausedMovement||[])];
    const existing=await tx.runPoint.findMany({where:{runId:id,seq:{in:ordered.map(p=>p.seq)}}}),bySeq=new Map(existing.map(p=>[p.seq,p])),fresh=[];
    for(const p of ordered){windowCheck(row,p.recordedAt,now);requirePastConsent(rows,row,p.recordedAt);
      const segment=segments.find(s=>(!p.segmentId||p.segmentId===s.id)&&+p.recordedAt>=+new Date(s.startedAt)&&(!s.endedAt||+p.recordedAt<=+new Date(s.endedAt)));
      if(!segment)fail(400,'POINT_OUTSIDE_SEGMENT','A point is outside an active recording segment.');
      // A process restart may have no position when Resume is tapped. Use the
      // earliest accurate point of that new segment, independent of batch order.
      if(segment.resumePositionSource==='point'&&p.accuracyM<=50&&(segment.resumePointSeq===undefined||p.seq<segment.resumePointSeq)){
        const previousSegment=segments[segments.indexOf(segment)-1];
        segment.resumePointSeq=p.seq;segment.resumePosition={lat:p.lat,lng:p.lng,accuracyM:p.accuracyM};
        pausedMovement=pausedMovement.filter(m=>m.eventId!==segment.id);
        const distanceM=pausedDistance(previousSegment?.pausePosition,segment.resumePosition);
        if(distanceM)pausedMovement.push({eventId:segment.id,distanceM});
      }
      const auxiliary={segmentId:segment.id,altitudeM:p.altitudeM,bearingDeg:p.bearingDeg,elapsedMs:p.elapsedMs,deviceTimestamp:p.deviceTimestamp.toISOString()};
      const previous=bySeq.get(p.seq);
      if(previous){if(previous.lat!==p.lat||previous.lng!==p.lng||+previous.recordedAt!==+p.recordedAt||previous.accuracyM!==Math.fround(p.accuracyM)||previous.speedMps!==(p.speedMps===null?null:Math.fround(p.speedMps))||previous.provider!==p.provider||previous.isMock!==p.isMock||digest(meta[p.seq])!==digest(auxiliary))fail(409,'POINT_CONFLICT','A stored sequence number has different point details.');}
      else{fresh.push({runId:id,seq:p.seq,lat:p.lat,lng:p.lng,recordedAt:p.recordedAt,accuracyM:p.accuracyM,speedMps:p.speedMps,provider:p.provider,isMock:p.isMock});meta[p.seq]=auxiliary;}
    }
    const low=ordered[0].seq,high=ordered.at(-1).seq;
    const neighbors=await tx.runPoint.findMany({where:{runId:id,seq:{gte:low,lte:high}},select:{seq:true,recordedAt:true}});
    const before=await tx.runPoint.findFirst({where:{runId:id,seq:{lt:low}},orderBy:{seq:'desc'},select:{seq:true,recordedAt:true}}),after=await tx.runPoint.findFirst({where:{runId:id,seq:{gt:high}},orderBy:{seq:'asc'},select:{seq:true,recordedAt:true}});
    const combined=[...(before?[before]:[]),...neighbors,...fresh.map(p=>({seq:p.seq,recordedAt:p.recordedAt})),...(after?[after]:[])].sort((a,b)=>a.seq-b.seq);
    for(let i=1;i<combined.length;i++)if(+combined[i].recordedAt<=+combined[i-1].recordedAt)fail(400,'OUT_OF_ORDER_TIMESTAMPS','Recording timestamps must increase with sequence numbers.');
    if(await tx.runPoint.count({where:{runId:id}})+fresh.length>100000)fail(409,'RUN_POINT_LIMIT','This run has reached 100,000 points. Finish it before recording more.');
    if(fresh.length)await tx.runPoint.createMany({data:fresh});
    const sequences=await tx.runPoint.findMany({where:{runId:id},orderBy:{seq:'asc'},select:{seq:true}}),gaps=sequenceGaps(sequences.map(p=>p.seq));
    const events=mergeEvents(signals,input.events,row,now),batches={...signals.batches,[input.batchKey]:{digest:hash,firstSeq:ordered[0].seq,lastSeq:ordered.at(-1).seq,batteryLevel:input.batteryLevel,stepDelta:input.stepDelta,invalidDropped:input.invalidDropped,receivedAt:now.toISOString()}};
    await tx.run.update({where:{id},data:{mockGps:row.mockGps||ordered.some(p=>p.isMock===true),runSignals:{...signals,segments,pausedMovement,pointMeta:meta,batches,events,sequenceGaps:gaps,...(fresh.length?{lastPointReceivedAt:now.toISOString()}: {})}}});
    return {highestSeq:sequences.at(-1)?.seq??-1,duplicate:!fresh.length,sequenceGaps:gaps,recordingAllowed:(await consent.recordingPermission(tx,user.id)).allowed};
  });}
  async function control(req,id,input,action){return transaction(req,async(tx,user,now)=>{
    const row=await owned(tx,user,id);installer(req,row);const signals=row.runSignals,controls=signals.controls||[],hash=digest({action,...input}),old=controls.find(e=>e.id===input.eventId);
    if(old){if(old.digest!==hash)fail(409,'IDEMPOTENCY_CONFLICT','This action identifier was reused.');return {run:dto(row)};}
    if(row.status!=='ACTIVE')fail(409,'RUN_FINISHED','This run is already finished.');windowCheck(row,input.recordedAt,now);
    if(controls.length&&+input.recordedAt<+new Date(controls.at(-1).recordedAt))fail(409,'CONTROL_OUT_OF_ORDER','Sync earlier pause and resume actions first.');
    const segments=structuredClone(signals.segments),open=segments.at(-1),paused=signals.recordingState==='PAUSED';
    if((action==='pause'&&paused)||(action==='resume'&&!paused))fail(409,'RUN_STATE_CHANGED','Refresh this run before changing its state.');
    let pausedMovement=signals.pausedMovement||[];
    if(action==='pause'){open.endedAt=input.recordedAt.toISOString();open.pausePosition=input.position||null;open.pauseReason=input.reason;}
    else{requirePastConsent(await history(tx,user.id),row,input.recordedAt);
      const manual=manualPause(open,controls),distanceM=manual?pausedDistance(open.pausePosition,input.position):0;
      if(distanceM)pausedMovement=[...pausedMovement,{eventId:input.eventId,distanceM}];
      segments.push({id:input.eventId,startedAt:input.recordedAt.toISOString(),endedAt:null,resumePosition:input.position||null,...(manual&&!input.position&&open.pausePosition?{resumePositionSource:'point'}:{})});}
    const updated=await tx.run.update({where:{id},data:{runSignals:{...signals,segments,recordingState:action==='pause'?'PAUSED':'ACTIVE',pausedMovement,
      controls:[...controls,{id:input.eventId,action,recordedAt:input.recordedAt.toISOString(),elapsedMs:input.elapsedMs,reason:input.reason,digest:hash}],events:mergeEvents(signals,input.events,row,now)}}});return {run:dto(updated)};
  });}
  async function signals(req,id,input){return transaction(req,async(tx,user,now)=>{
    const row=await owned(tx,user,id);installer(req,row);if(row.status!=='ACTIVE')fail(409,'RUN_FINISHED','This run is already finished.');
    const prior=row.runSignals.signalReceipts?.[input.eventId],hash=digest(input);if(prior&&prior!==hash)fail(409,'IDEMPOTENCY_CONFLICT','This signal identifier was reused.');
    if(!prior)await tx.run.update({where:{id},data:{runSignals:{...row.runSignals,events:mergeEvents(row.runSignals,input.events,row,now),signalReceipts:{...row.runSignals.signalReceipts,[input.eventId]:hash}}}});
    return {accepted:true};
  });}
  async function geography(tx,points){
    if(!points.length)return {restricted:false,restrictedSeqs:[],region:null};
    const cellBySeq=new Map(points.filter(p=>p.provider!=='network').map(p=>[p.seq,h3.latLngToCell(p.lat,p.lng,11)]));
    const indices=[...new Set(cellBySeq.values())].map(cell=>BigInt('0x'+cell)),restricted=[];
    for(let offset=0;offset<indices.length;offset+=4000)restricted.push(...await tx.restrictedZoneHex.findMany({where:{h3Index:{in:indices.slice(offset,offset+4000)},zone:{active:true}},select:{h3Index:true}}));
    const cells=new Set(restricted.map(row=>row.h3Index.toString(16))),restrictedSeqs=points.filter(p=>cells.has(cellBySeq.get(p.seq))).map(p=>p.seq);
    const regions=await tx.regionCell.findMany({include:{region:{select:{id:true,name:true,city:true}}}}),first=points[0],parent=h3.latLngToCell(first.lat,first.lng,6);
    let closest=regions.find(r=>r.parentH3.toString(16)===parent);if(!closest)closest=regions.map(r=>{try{const [lat,lng]=h3.cellToLatLng(r.parentH3.toString(16));return {...r,distance:haversine(first,{lat,lng})};}catch{return {...r,distance:Infinity};}}).sort((a,b)=>a.distance-b.distance||a.regionId.localeCompare(b.regionId)).find(r=>Number.isFinite(r.distance));
    return {restricted:restrictedSeqs.length>0,restrictedSeqs,region:closest?.region||null};
  }
  async function complete(tx,row,input,now){
    if(row.status!=='ACTIVE')return {run:dto(row)};
    windowCheck(row,input.endedAt,now);if(+input.endedAt<=+row.startedAt)fail(400,'INVALID_END_TIME','Finish time must be after the start.');
    const points=await tx.runPoint.findMany({where:{runId:row.id},orderBy:{seq:'asc'}});
    if(input.lastSeq!==undefined&&input.lastSeq!==(points.at(-1)?.seq??-1))fail(409,'UPLOAD_INCOMPLETE','Upload all saved batches before finishing.');
    if(input.reason==='RECOVERY'){
      const lastTime=Math.max(+row.startedAt+1,points.length?+points.at(-1).recordedAt:0);
      if(+input.endedAt!==lastTime)fail(400,'INVALID_END_TIME','Recovery must finish at the last saved point.');
    }
    const tail=points.filter(p=>+p.recordedAt>+input.endedAt);
    if(tail.length){
      if(input.reason!=='STATIONARY')fail(400,'INVALID_END_TIME','Finish time cannot precede a saved point.');
      const anchor=points.filter(p=>+p.recordedAt<=+input.endedAt&&p.accuracyM<=50).at(-1);
      if(tail.some(p=>p.accuracyM<=50&&(!anchor||haversine(anchor,p)>15)))fail(409,'RUN_STILL_MOVING','Saved points show movement after the proposed finish time. Finish at the last saved point instead.');
    }
    const signals=structuredClone(row.runSignals);let segments=signals.segments||[];
    if(input.reason==='STATIONARY'||input.reason==='RECOVERY'){
      // Raw controls/events remain evidence, including a manual pause after
      // movement stopped. Duration uses only windows up to the stationary end.
      segments=segments.filter(s=>+new Date(s.startedAt)<=+input.endedAt).map(s=>({...s,endedAt:!s.endedAt||+new Date(s.endedAt)>+input.endedAt?input.endedAt.toISOString():s.endedAt}));
      signals.segments=segments;
    }
    if(segments.some(s=>+new Date(s.startedAt)>+input.endedAt||(s.endedAt&&+new Date(s.endedAt)>+input.endedAt)))fail(400,'INVALID_END_TIME','Finish time cannot precede a pause or resume.');
    if(segments.length&&!segments.at(-1).endedAt)segments.at(-1).endedAt=input.endedAt.toISOString();
    signals.events=mergeEvents(signals,input.events||[],row,now);
    const activePoints=points.filter(p=>+p.recordedAt<=+input.endedAt);
    const summary=summarize(activePoints,signals,row.startedAt,input.endedAt),geo=await geography(tx,activePoints),reviews=[];
    if(+input.endedAt-+row.startedAt>8*3600000)reviews.push({code:'LONG_RUN',severity:'INFO'});
    const invalid=Math.max(input.invalidDroppedTotal||0,Object.values(signals.batches||{}).reduce((sum,b)=>sum+(b.invalidDropped||0),0));
    signals.invalidDroppedTotal=invalid;signals.finishReason=input.reason||'USER';signals.stationaryTailSeqs=tail.map(p=>p.seq);
    if(invalid/(invalid+points.length)>.2)reviews.push({code:'INVALID_POINT_RATIO',severity:'SOFT'});
    const movement=signals.pausedMovement||[];if(movement.length>=3||movement.reduce((sum,m)=>sum+m.distanceM,0)>1000)reviews.push({code:'PAUSED_MOVEMENT',severity:'SOFT'});
    signals.summary={acceptedPoints:summary.acceptedPoints,gaps:summary.gaps,outlierSeqs:summary.outlierSeqs,routeSegments:summary.routeSegments,...geo,reviews};
    signals.recordingState='DONE';
    const finished=await tx.run.update({where:{id:row.id},data:{endedAt:input.endedAt,durationS:summary.durationS,distanceM:summary.distanceM,routePolyline:summary.polyline,status:'PENDING_VALIDATION',runSignals:signals}});
    return {run:dto(finished)};
  }
  const finish=(req,id,input)=>transaction(req,async(tx,user,now)=>{const row=await owned(tx,user,id);installer(req,row);return complete(tx,row,input,now);});
  async function endStale(req,id){return transaction(req,async(tx,user,now)=>{
    const row=await owned(tx,user,id);if(row.status!=='ACTIVE')return {run:dto(row)};
    const lastReceived=+new Date(row.runSignals.lastPointReceivedAt||row.createdAt);if(+now-lastReceived<600000)fail(409,'RUN_RECENTLY_ACTIVE','The other recording received points less than ten minutes ago.');
    const last=await tx.runPoint.findFirst({where:{runId:id},orderBy:{recordedAt:'desc'}});
    const controls=row.runSignals.controls||[];const end=new Date(Math.max(+row.startedAt+1,last?+last.recordedAt:0,...controls.map(c=>+new Date(c.recordedAt))));
    return complete(tx,row,{endedAt:end,events:[]},now);
  });}
  async function remove(req,id){return transaction(req,async(tx,user,now)=>{
    const row=await owned(tx,user,id,{deleted:true});if(row.deletedAt)return;installer(req,row);
    if(await tx.hexOwnership.findFirst({where:{runId:id},select:{h3Index:true}})||await tx.runHex.findFirst({where:{runId:id,outcome:'CAPTURED'},select:{h3Index:true}}))fail(409,'RUN_ALREADY_CLAIMED','This run has already claimed territory and cannot be discarded here.');
    await tx.run.update({where:{id},data:{deletedAt:now}});
  });}
  async function list(req,input){return transaction(req,async(tx,user)=>{
    let cursor=null;if(input.cursor){try{const raw=JSON.parse(Buffer.from(input.cursor,'base64url').toString('utf8'));if(!uuid.safeParse(raw.id).success||!Number.isFinite(Date.parse(raw.startedAt)))throw Error();cursor={id:raw.id,startedAt:new Date(raw.startedAt)};}catch{fail(400,'INVALID_CURSOR','Refresh run history and try again.');}}
    const where={userId:user.id,deletedAt:null,...(input.active?{status:input.active==='true'?'ACTIVE':{not:'ACTIVE'}}:{}),...(cursor?{OR:[{startedAt:{lt:cursor.startedAt}},{startedAt:cursor.startedAt,id:{lt:cursor.id}}]}:{})};
    // History never loads the potentially large per-point journal into Node.
    const rows=await tx.run.findMany({where,select:{id:true,clientRunId:true,startedAt:true,endedAt:true,distanceM:true,durationS:true,status:true,mockGps:true,createdAt:true},orderBy:[{startedAt:'desc'},{id:'desc'}],take:input.limit+1}),more=rows.length>input.limit,page=rows.slice(0,input.limit),last=page.at(-1);
    if(page.length){const summaries=await tx.$queryRaw`SELECT id,jsonb_build_object('recordingState',run_signals->'recordingState','summary',run_signals->'summary','sequenceGaps',run_signals->'sequenceGaps') AS signals FROM runs WHERE id IN (${Prisma.join(page.map(row=>Prisma.sql`${row.id}::uuid`))})`;
      const byId=new Map(summaries.map(row=>[row.id,row.signals]));for(const row of page)row.runSignals=byId.get(row.id);}
    return {runs:page.map(dto),nextCursor:more?Buffer.from(JSON.stringify({id:last.id,startedAt:last.startedAt})).toString('base64url'):null,recordingAllowed:(await consent.recordingPermission(tx,user.id)).allowed};
  });}
  async function detail(req,id,input){return transaction(req,async(tx,user)=>{
    const row=await owned(tx,user,id),points=await tx.runPoint.findMany({where:{runId:id,seq:{gt:input.afterSeq}},orderBy:{seq:'asc'},take:input.pointLimit+1}),more=points.length>input.pointLimit,page=points.slice(0,input.pointLimit);
    return {run:dto(row),points:page.map(({id:_id,runId:_runId,...p})=>({...p,...(row.runSignals.pointMeta?.[p.seq]||{})})),nextPointSeq:more?page.at(-1).seq:null,
      segments:row.runSignals.segments||[],events:row.runSignals.events||[],recordingAllowed:(await consent.recordingPermission(tx,user.id)).allowed};
  });}
  return {create,points,control,signals,finish,endStale,remove,list,detail};
}
module.exports={createRunService,dto,digest};
