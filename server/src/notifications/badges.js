'use strict';
// Badge progress and idempotent awarding. Awarding runs inside the caller's
// transaction (run completion) and only the insert that actually creates a
// user_badges row creates the BADGE_EARNED notification, so repeats are no-ops.
const {Prisma}=require('@prisma/client');
const completed=Prisma.sql`status='VALID' AND deleted_at IS NULL AND duration_s IS NOT NULL`;
const UNITS={TOTAL_DISTANCE:'km',HEX_COUNT:'cells',STREAK_DAYS:'days',RUN_COUNT:'runs'};
async function progressValues(tx,userId){
  const [[tot],[cells],stat]=await Promise.all([
    tx.$queryRaw`SELECT COUNT(*)::int AS runs,COALESCE(SUM(distance_m),0)::bigint AS dist FROM runs WHERE user_id=${userId}::uuid AND ${completed}`,
    tx.$queryRaw`SELECT COUNT(*)::int AS n FROM hex_ownership WHERE owner_id=${userId}::uuid`,
    tx.userStat.findUnique({where:{userId}})]);
  // TOTAL_DISTANCE thresholds are stored in metres by the seed (10000 = 10 km).
  return {TOTAL_DISTANCE:Number(tot.dist),HEX_COUNT:cells.n,STREAK_DAYS:Math.max(stat?.bestStreak||0,stat?.streakDays||0),RUN_COUNT:tot.runs};
}
async function awardBadges(tx,userId){
  const [badges,have,values]=await Promise.all([tx.badge.findMany(),tx.userBadge.findMany({where:{userId},select:{badgeId:true}}),progressValues(tx,userId)]);
  const owned=new Set(have.map(h=>h.badgeId)),earned=[];
  for(const b of badges){
    if(owned.has(b.id)||values[b.criteria]<b.threshold)continue;
    const created=await tx.userBadge.createMany({data:[{userId,badgeId:b.id}],skipDuplicates:true});
    if(!created.count)continue;
    earned.push({id:b.id,code:b.code,name:b.name,description:b.description});
    await tx.notification.create({data:{userId,type:'BADGE_EARNED',title:`Badge earned: ${b.name}`.slice(0,100),body:b.description}});
  }
  return earned;
}
module.exports={awardBadges,progressValues,UNITS};
