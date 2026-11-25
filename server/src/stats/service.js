'use strict';
const {Prisma}=require('@prisma/client');
const {currentAccount,lockAccountWork,publicError}=require('../profile/common');
const {databaseNow}=require('../auth/session-core');
const {computeSplits}=require('./splits');
const DAY=86400000,MAX_SPLIT_POINTS=60000;
const num=v=>v===null||v===undefined?0:Number(v);
const RANGES={week:{bucket:'day',count:7},month:{bucket:'day',count:30},year:{bucket:'month',count:12}};
function bucketStarts(now,bucket,count){
  const out=[];
  if(bucket==='day'){const today=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());for(let i=count-1;i>=0;i--)out.push(new Date(today-i*DAY));}
  else for(let i=count-1;i>=0;i--)out.push(new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-i,1)));
  return out;
}
function createStatsService({prisma}){
  async function transaction(req,task){return prisma.$transaction(async tx=>{await lockAccountWork(tx,req.authUser.id);const user=await currentAccount(tx,req);return task(tx,user,await databaseNow(tx));},{timeout:30000,maxWait:15000});}
  const completed=Prisma.sql`status='VALID' AND deleted_at IS NULL AND duration_s IS NOT NULL`;
  async function overview(req,{range}){return transaction(req,async(tx,user,now)=>{
    const {bucket,count}=RANGES[range],starts=bucketStarts(now,bucket,count),from=starts[0];
    const rows=await tx.$queryRaw`SELECT date_trunc(${bucket},started_at AT TIME ZONE 'UTC') AS b,COUNT(*)::int AS runs,COALESCE(SUM(distance_m),0)::bigint AS dist,COALESCE(SUM(duration_s),0)::bigint AS dur
      FROM runs WHERE user_id=${user.id}::uuid AND ${completed} AND started_at>=${from} GROUP BY 1`;
    const map=new Map(rows.map(r=>[new Date(`${r.b.toISOString().slice(0,19)}Z`).toISOString(),r]));
    const series=starts.map(s=>{const r=map.get(s.toISOString());return {start:s.toISOString(),runs:r?r.runs:0,distanceM:r?num(r.dist):0,durationS:r?num(r.dur):0};});
    const totals=series.reduce((a,s)=>({runs:a.runs+s.runs,distanceM:a.distanceM+s.distanceM,durationS:a.durationS+s.durationS}),{runs:0,distanceM:0,durationS:0});
    const [life]=await tx.$queryRaw`SELECT COUNT(*)::int AS runs,COALESCE(SUM(distance_m),0)::bigint AS dist,COALESCE(SUM(duration_s),0)::bigint AS dur FROM runs WHERE user_id=${user.id}::uuid AND ${completed}`;
    const stat=await tx.userStat.findUnique({where:{userId:user.id}});
    return {range,bucket,series,totals:{...totals,paceSecondsPerKm:totals.distanceM>0?Math.round(totals.durationS*1000/totals.distanceM):null},
      lifetime:{runs:life.runs,distanceM:num(life.dist),durationS:num(life.dur)},streak:{current:stat?.streakDays||0,best:stat?.bestStreak||0,lastRunOn:stat?.lastRunOn||null}};
  });}
  async function records(req){return transaction(req,async(tx,user)=>{
    const pick=async(order,extra=Prisma.empty)=>(await tx.$queryRaw`SELECT id,started_at,distance_m,duration_s FROM runs WHERE user_id=${user.id}::uuid AND ${completed} AND distance_m>0 ${extra} ORDER BY ${order},started_at DESC LIMIT 1`)[0]||null;
    const shape=r=>r&&{runId:r.id,startedAt:r.started_at,distanceM:r.distance_m,durationS:r.duration_s,paceSecondsPerKm:Math.round(r.duration_s*1000/r.distance_m)};
    const longest=await pick(Prisma.sql`distance_m DESC`),longestTime=await pick(Prisma.sql`duration_s DESC`);
    const fastest={};
    // "Fastest" is the best average pace among runs of at least that distance (run-level, not a mid-run split).
    for(const [key,min] of [['1k',1000],['5k',5000],['10k',10000],['half',21097]])fastest[key]=shape(await pick(Prisma.sql`(duration_s::float/distance_m) ASC`,Prisma.sql`AND distance_m>=${min}`));
    const [week]=await tx.$queryRaw`SELECT date_trunc('week',started_at AT TIME ZONE 'UTC') AS b,SUM(distance_m)::bigint AS dist FROM runs WHERE user_id=${user.id}::uuid AND ${completed} GROUP BY 1 ORDER BY 2 DESC,1 DESC LIMIT 1`;
    const [hex]=await tx.$queryRaw`SELECT r.id,r.started_at,COUNT(*)::int AS n FROM runs r JOIN run_hexes h ON h.run_id=r.id WHERE r.user_id=${user.id}::uuid AND r.status='VALID' AND r.deleted_at IS NULL AND h.outcome IN ('CAPTURED','REFRESHED') GROUP BY r.id ORDER BY n DESC,r.started_at DESC LIMIT 1`;
    const stat=await tx.userStat.findUnique({where:{userId:user.id}});
    return {longestDistance:shape(longest),longestDuration:shape(longestTime),fastest,
      bestWeek:week?{weekStart:week.b.toISOString(),distanceM:num(week.dist)}:null,
      mostCellsInRun:hex?{runId:hex.id,startedAt:hex.started_at,cells:hex.n}:null,bestStreakDays:stat?.bestStreak||0};
  });}
  async function achievements(req){return transaction(req,async(tx,user)=>{
    const [badges,earned,[tot],[cells],stat]=await Promise.all([tx.badge.findMany({orderBy:[{criteria:'asc'},{threshold:'asc'}]}),tx.userBadge.findMany({where:{userId:user.id}}),
      tx.$queryRaw`SELECT COUNT(*)::int AS runs,COALESCE(SUM(distance_m),0)::bigint AS dist FROM runs WHERE user_id=${user.id}::uuid AND ${completed}`,
      tx.$queryRaw`SELECT COUNT(*)::int AS n FROM hex_ownership WHERE owner_id=${user.id}::uuid`,tx.userStat.findUnique({where:{userId:user.id}})]);
    const awarded=new Map(earned.map(e=>[e.badgeId,e.awardedAt]));
    const value={TOTAL_DISTANCE:Math.floor(num(tot.dist)/1000),HEX_COUNT:cells.n,STREAK_DAYS:Math.max(stat?.bestStreak||0,stat?.streakDays||0),RUN_COUNT:tot.runs};
    const unit={TOTAL_DISTANCE:'km',HEX_COUNT:'cells',STREAK_DAYS:'days',RUN_COUNT:'runs'};
    return {badges:badges.map(b=>{const progress=value[b.criteria];return {id:b.id,code:b.code,name:b.name,description:b.description,criteria:b.criteria,unit:unit[b.criteria],threshold:b.threshold,
      progress:Math.min(progress,b.threshold),earned:progress>=b.threshold||awarded.has(b.id),awardedAt:awarded.get(b.id)||null};})};
  });}
  async function splits(req,id,{unit}){return transaction(req,async(tx,user)=>{
    const run=await tx.run.findFirst({where:{id,userId:user.id,deletedAt:null},select:{id:true,status:true}});
    if(!run||run.status==='ACTIVE')throw publicError(404,'NOT_FOUND','This run was not found.');
    const points=await tx.runPoint.findMany({where:{runId:id},orderBy:{seq:'asc'},take:MAX_SPLIT_POINTS,select:{lat:true,lng:true,recordedAt:true,accuracyM:true}});
    const unitM=unit==='mi'?1609.344:1000;
    return {unit,...computeSplits(points,unitM)};
  });}
  return {overview,records,achievements,splits};
}
module.exports={createStatsService,bucketStarts};
