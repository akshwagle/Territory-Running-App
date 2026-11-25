'use strict';
const {routeCells,toIndex,toCell}=require('./cells');
// Tunables are documented in server/README.md. Cooldown, speed and accuracy come
// from game_settings; the minimum claimable distance and jump count are constants.
const MIN_CLAIM_DISTANCE_M=100,JUMP_FLAG_COUNT=3,CHUNK=2000;
const DEFAULTS={claim_cooldown_minutes:30,max_speed_mps:8.5,min_gps_accuracy_m:30};
async function loadSettings(tx){
  const rows=await tx.gameSetting.findMany({where:{key:{in:Object.keys(DEFAULTS)}}}),out={...DEFAULTS};
  for(const row of rows){const n=Number(row.value);if(Number.isFinite(n)&&n>=0)out[row.key]=n;}
  return out;
}
function evaluateRun({run,points,summary},settings){
  const reasons=[];
  if(run.mockGps||points.some(p=>p.isMock===true))reasons.push({reason:'MOCK_LOCATION',details:'The device reported mock location data.'});
  const speed=summary.durationS>0?summary.distanceM/summary.durationS:0;
  if(speed>settings.max_speed_mps)reasons.push({reason:'SPEED_LIMIT',details:`Average speed ${speed.toFixed(1)} m/s exceeds ${settings.max_speed_mps} m/s.`});
  if(summary.outlierSeqs.length>=JUMP_FLAG_COUNT)reasons.push({reason:'GPS_JUMP',details:`${summary.outlierSeqs.length} impossible position jumps.`});
  return reasons;
}
async function restrictedZones(tx,indices){
  const found=new Map();
  for(let i=0;i<indices.length;i+=CHUNK){
    const rows=await tx.restrictedZoneHex.findMany({where:{h3Index:{in:indices.slice(i,i+CHUNK)},zone:{active:true}},select:{h3Index:true,zoneId:true},orderBy:[{zoneId:'asc'},{h3Index:'asc'}]});
    for(const r of rows)if(!found.has(r.h3Index))found.set(r.h3Index,r.zoneId);
  }
  return found;
}
// Documented conditional upsert, batched. Cells are sorted by h3_index so any two
// concurrent runs lock/insert in the same order (no deadlock). hex_ownership's
// primary key keeps exactly one owner per cell; the WHERE clause refuses a
// capture until cooldown_until has passed.
async function claimBatch(tx,{runId,userId,cooldownMinutes,indices}){
  const outcomes=new Map(),holders=new Map();
  for(let i=0;i<indices.length;i+=CHUNK){
    const chunk=indices.slice(i,i+CHUNK),ids=chunk.map(String);
    const held=await tx.$queryRaw`SELECT h3_index::text AS h3, owner_id::text AS owner FROM hex_ownership WHERE h3_index = ANY(${ids}::bigint[]) ORDER BY h3_index FOR UPDATE`;
    const before=new Map(held.map(r=>[r.h3,r.owner]));
    const claimed=await tx.$queryRaw`
      INSERT INTO hex_ownership (h3_index, owner_id, run_id, claimed_at, cooldown_until)
      SELECT c, ${userId}::uuid, ${runId}::uuid, now(), now() + make_interval(mins => ${cooldownMinutes}::int)
      FROM unnest(${ids}::bigint[]) AS u(c) ORDER BY c
      ON CONFLICT (h3_index) DO UPDATE SET owner_id = EXCLUDED.owner_id, run_id = EXCLUDED.run_id,
        claimed_at = now(), cooldown_until = EXCLUDED.cooldown_until
      WHERE hex_ownership.cooldown_until <= now()
      RETURNING h3_index::text AS h3`;
    const won=new Set(claimed.map(r=>r.h3));
    const missing=[];
    for(const id of ids){
      if(won.has(id)){const prev=before.get(id)||null;outcomes.set(id,prev===userId?{outcome:'REFRESHED',prev}:{outcome:'CAPTURED',prev});}
      else{holders.set(id,before.get(id)||null);if(!before.has(id))missing.push(id);}
    }
    if(missing.length){
      const now=await tx.$queryRaw`SELECT h3_index::text AS h3, owner_id::text AS owner FROM hex_ownership WHERE h3_index = ANY(${missing}::bigint[])`;
      for(const r of now)holders.set(r.h3,r.owner);
    }
  }
  for(const [id,owner] of holders)outcomes.set(id,{outcome:'ON_COOLDOWN',prev:owner});
  return outcomes;
}
function dayKey(date){return date.toISOString().slice(0,10);}
async function updateStats(tx,run){
  const day=dayKey(run.endedAt||run.startedAt),current=await tx.userStat.findUnique({where:{userId:run.userId}});
  let streak=1;
  if(current?.lastRunOn){
    const last=dayKey(current.lastRunOn),gap=Math.round((Date.parse(day)-Date.parse(last))/86400000);
    streak=gap<=0?Math.max(1,current.streakDays):gap===1?current.streakDays+1:1;
  }
  const best=Math.max(current?.bestStreak||0,streak),lastRunOn=current?.lastRunOn&&dayKey(current.lastRunOn)>day?current.lastRunOn:new Date(day);
  const data={totalRuns:{increment:1},totalDistM:{increment:BigInt(run.distanceM)},streakDays:streak,bestStreak:best,lastRunOn};
  await tx.userStat.upsert({where:{userId:run.userId},create:{userId:run.userId,totalRuns:1,totalDistM:BigInt(run.distanceM),streakDays:streak,bestStreak:best,lastRunOn},update:data});
}
// Runs inside the finish transaction (account-work lock already held).
// Returns the final run status and writes run_flags/run_hexes/hex_ownership/user_stats.
async function validateAndClaim(tx,{run,points,summary,pointMeta}){
  const settings=await loadSettings(tx),reasons=evaluateRun({run,points,summary},settings);
  if(reasons.length){
    await tx.runFlag.createMany({data:reasons.map(r=>({runId:run.id,reason:r.reason,details:r.details}))});
    return {status:'FLAGGED',reasons:reasons.map(r=>r.reason)};
  }
  if(summary.distanceM<MIN_CLAIM_DISTANCE_M)return {status:'REJECTED',reasons:['TOO_SHORT']};
  const cells=routeCells(points,{minAccuracyM:settings.min_gps_accuracy_m,outlierSeqs:summary.outlierSeqs,pointMeta});
  const indices=[...new Set(cells.map(toIndex))].sort((a,b)=>a<b?-1:a>b?1:0);
  const zones=await restrictedZones(tx,indices),open=indices.filter(i=>!zones.has(i));
  if(zones.size){
    const perZone=new Map();for(const zoneId of zones.values())perZone.set(zoneId,(perZone.get(zoneId)||0)+1);
    await tx.runFlag.createMany({data:[...perZone].map(([zoneId,count])=>({runId:run.id,zoneId,reason:'RESTRICTED_ZONE',details:`${count} cells inside a restricted zone were not claimed.`}))});
  }
  const outcomes=await claimBatch(tx,{runId:run.id,userId:run.userId,cooldownMinutes:Math.round(settings.claim_cooldown_minutes),indices:open});
  const rows=indices.map(index=>{
    if(zones.has(index))return {runId:run.id,h3Index:index,outcome:'RESTRICTED',prevOwnerId:null};
    const r=outcomes.get(String(index));return {runId:run.id,h3Index:index,outcome:r.outcome,prevOwnerId:r.prev};
  });
  for(let i=0;i<rows.length;i+=CHUNK)await tx.runHex.createMany({data:rows.slice(i,i+CHUNK)});
  await updateStats(tx,run);
  return {status:'VALID',reasons:[]};
}
module.exports={validateAndClaim,evaluateRun,claimBatch,loadSettings,MIN_CLAIM_DISTANCE_M,toCell};
