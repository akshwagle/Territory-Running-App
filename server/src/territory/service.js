'use strict';
const h3=require('h3-js');
const {Prisma}=require('@prisma/client');
const {currentAccount,publicError}=require('../profile/common');
const {canView}=require('../profile/privacy');
const {haversine}=require('../runs/math');
const {coveringRanges}=require('./bbox');
const {toCell}=require('./cells');
const MAX_SPAN_DEG=0.1,MAX_MAP_CELLS=5000;
const fail=(status,code,message)=>{throw publicError(status,code,message);};
function createTerritoryService({prisma}){
  const read=(req,task)=>prisma.$transaction(async tx=>task(tx,await currentAccount(tx,req)),{timeout:20000});
  // Counts are derived from hex_ownership at read time; no counter is stored.
  const mine=(req,input)=>read(req,async(tx,user)=>{
    let cursor=null;
    if(input.cursor){try{const raw=JSON.parse(Buffer.from(input.cursor,'base64url').toString('utf8'));cursor={h3:BigInt(raw.h3)};}catch{fail(400,'INVALID_CURSOR','Refresh your territory and try again.');}}
    // Paged by h3_index: claimed_at has microsecond precision that a JSON cursor would truncate.
    const where={ownerId:user.id,...(cursor?{h3Index:{lt:cursor.h3}}:{})};
    const [count,rows]=await Promise.all([tx.hexOwnership.count({where:{ownerId:user.id}}),
      tx.hexOwnership.findMany({where,orderBy:{h3Index:'desc'},take:input.limit+1})]);
    const page=rows.slice(0,input.limit),last=page.at(-1),now=Date.now();
    return {count,hexes:page.map(r=>({h3:toCell(r.h3Index),claimedAt:r.claimedAt,cooldownUntil:r.cooldownUntil,onCooldown:+r.cooldownUntil>now})),
      nextCursor:rows.length>input.limit?Buffer.from(JSON.stringify({h3:last.h3Index.toString()})).toString('base64url'):null};
  });
  const inBox=(h,box)=>{const [lat,lng]=h3.cellToLatLng(h);return lat>=box.minLat&&lat<=box.maxLat&&lng>=box.minLng&&lng<=box.maxLng;};
  const map=(req,box)=>read(req,async(tx,user)=>{
    if(box.minLat>=box.maxLat||box.minLng>=box.maxLng||box.maxLat-box.minLat>MAX_SPAN_DEG||box.maxLng-box.minLng>MAX_SPAN_DEG)fail(400,'INVALID_BOUNDS','Zoom in: the map area is too large.');
    const ranges=coveringRanges(box),clauses=ranges.map(r=>Prisma.sql`(h.h3_index BETWEEN ${r.min.toString()}::bigint AND ${r.max.toString()}::bigint)`);
    const rows=await tx.$queryRaw`
      SELECT h.h3_index::text AS h3, h.owner_id::text AS owner_id, h.claimed_at, h.cooldown_until, u.display_name, u.deletion_at, u.suspended_at,
        p.profile_visibility, p.home_hex::text AS home_hex, p.hide_radius_m
      FROM hex_ownership h JOIN users u ON u.id=h.owner_id LEFT JOIN user_privacy_settings p ON p.user_id=h.owner_id
      WHERE ${Prisma.join(clauses,' OR ')} ORDER BY h.h3_index LIMIT ${MAX_MAP_CELLS*3}`;
    const now=Date.now(),hexes=[],homes=new Map();let truncated=false;
    for(const r of rows){
      const cell=BigInt(r.h3).toString(16);if(!inBox(cell,box))continue;
      const own=r.owner_id===user.id;
      if(!own&&r.home_hex){// owners may hide territory around their home from everyone else
        let home=homes.get(r.home_hex);if(!home){try{home=h3.cellToLatLng(BigInt(r.home_hex).toString(16));}catch{home=null;}homes.set(r.home_hex,home);}
        const [lat,lng]=h3.cellToLatLng(cell);if(home&&haversine({lat,lng},{lat:home[0],lng:home[1]})<=r.hide_radius_m)continue;
      }
      if(hexes.length>=MAX_MAP_CELLS){truncated=true;break;}
      const target={id:r.owner_id,displayName:r.display_name,deletionAt:r.deletion_at,suspendedAt:r.suspended_at,privacy:{profileVisibility:r.profile_visibility||'PRIVATE'}};
      const visible=own||canView(user,target);
      hexes.push({h3:cell,owner:own?{kind:'me'}:{kind:'other',ownerId:visible?r.owner_id:null,displayName:visible?r.display_name:'Runner'},
        claimedAt:r.claimed_at,cooldownUntil:r.cooldown_until,onCooldown:+r.cooldown_until>now});
    }
    return {hexes,truncated};
  });
  const claim=(req,runId)=>read(req,async(tx,user)=>{
    const run=await tx.run.findFirst({where:{id:runId,userId:user.id,deletedAt:null},select:{id:true,status:true,distanceM:true,runSignals:true}});
    if(!run)fail(404,'NOT_FOUND','This run was not found.');
    const grouped=await tx.runHex.groupBy({by:['outcome'],where:{runId},_count:{_all:true}}),count=o=>grouped.find(g=>g.outcome===o)?._count._all||0;
    const [fromOthers]=await tx.$queryRaw`SELECT count(*)::int AS n FROM run_hexes WHERE run_id=${runId}::uuid AND outcome='CAPTURED' AND prev_owner_id IS NOT NULL AND prev_owner_id<>${user.id}::uuid`;
    // "Lost": cells this run took that someone else holds now (derived, never stored).
    const [lost]=await tx.$queryRaw`SELECT count(*)::int AS n FROM run_hexes r JOIN hex_ownership h ON h.h3_index=r.h3_index WHERE r.run_id=${runId}::uuid AND r.outcome IN ('CAPTURED','REFRESHED') AND h.owner_id<>${user.id}::uuid`;
    const flags=await tx.runFlag.findMany({where:{runId},select:{reason:true,status:true},orderBy:{createdAt:'asc'}});
    const claimed=count('CAPTURED')+count('REFRESHED');
    return {runId,status:run.status,distanceM:run.distanceM,claim:{claimed,captured:count('CAPTURED'),capturedFromOthers:fromOthers.n,refreshed:count('REFRESHED'),
      onCooldown:count('ON_COOLDOWN'),restricted:count('RESTRICTED'),lost:lost.n,heldNow:claimed-lost.n},
      reasons:run.runSignals?.summary?.validation?.reasons||[],flags};
  });
  return {mine,map,claim};
}
module.exports={createTerritoryService,MAX_SPAN_DEG,MAX_MAP_CELLS};
