'use strict';
const crypto=require('node:crypto');
const {Prisma}=require('@prisma/client');
const {currentAccount,publicError}=require('../profile/common');
const {canView,leaderboardIdentity}=require('../profile/privacy');

const MAX_TEAM_MEMBERS=50,MAX_FOLLOWING=500,MAX_PAGE=50;
const CODE_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const fail=(status,code,message)=>{throw publicError(status,code,message);};
const newInviteCode=()=>Array.from(crypto.randomBytes(10),b=>CODE_ALPHABET[b%CODE_ALPHABET.length]).join('');
const encode=obj=>Buffer.from(JSON.stringify(obj)).toString('base64url');
function decode(cursor){
  if(!cursor)return null;
  try{const raw=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));
    if(typeof raw.t!=='string'||!/^[0-9a-f-]{36}$/.test(raw.id)||Number.isNaN(Date.parse(raw.t)))throw Error('bad');return raw;}
  catch{return fail(400,'INVALID_CURSOR','Refresh and try again.');}
}
const targetOf=row=>({id:row.id,displayName:row.display_name,deletionAt:row.deletion_at,suspendedAt:row.suspended_at,
  privacy:{profileVisibility:row.profile_visibility||'PRIVATE',appearOnLeaderboards:row.appear_on_leaderboards===true}});
const person=(viewer,row,isFollower)=>{
  const visible=viewer.id===row.id||canView(viewer,targetOf(row),{isFollower});
  return {id:visible?row.id:null,displayName:visible?row.display_name:'Runner',avatarId:visible?row.avatar_id:0,avatarColor:visible?row.avatar_color:'#5A5F58',canOpen:visible};
};

function createCommunityService({prisma,clock=()=>new Date()}){
  const read=(req,task)=>prisma.$transaction(async tx=>task(tx,await currentAccount(tx,req)),{timeout:20000});
  const lockTeam=(tx,teamId)=>tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${'team:'+teamId},0))`;
  const lockFollows=(tx,userId)=>tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${'follows:'+userId},0))`;

  async function activeSeason(tx){
    const now=clock();
    return tx.season.findFirst({where:{status:'ACTIVE',startsAt:{lte:now},endsAt:{gt:now}},orderBy:{startsAt:'desc'}});
  }
  const seasonDto=(s,now)=>s&&{id:s.id,name:s.name,startsAt:s.startsAt,endsAt:s.endsAt,status:s.status,
    daysLeft:Math.max(0,Math.ceil((+s.endsAt-+now)/86400000))};
  const periodStart=(period,now,season)=>{
    if(period==='week'){const d=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d;}
    if(period==='month')return new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1));
    if(period==='season')return season?season.startsAt:null;
    return new Date(0);
  };

  // Everything below is derived at read time from hex_ownership and runs. season_scores is a frozen
  // end-of-season snapshot and is never written here.
  function valueSql(metric,since){
    if(metric==='hexes')return Prisma.sql`SELECT owner_id AS user_id, count(*)::bigint AS value FROM hex_ownership GROUP BY owner_id`;
    const sel=metric==='runs'?Prisma.sql`count(*)::bigint`:Prisma.sql`COALESCE(sum(distance_m),0)::bigint`;
    return Prisma.sql`SELECT user_id, ${sel} AS value FROM runs WHERE status='VALID' AND deleted_at IS NULL AND started_at>=${since} GROUP BY user_id`;
  }
  async function ranked(tx,user,{metric,period,scope,limit,offset,teamId,since}){
    const scopeSql=scope==='following'?Prisma.sql`AND (u.id=${user.id}::uuid OR EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=${user.id}::uuid AND f.followee_id=u.id))`
      :scope==='team'?Prisma.sql`AND EXISTS(SELECT 1 FROM team_members tm WHERE tm.user_id=u.id AND tm.team_id=${teamId}::uuid)`:Prisma.empty;
    const base=Prisma.sql`
      WITH v AS (${valueSql(metric,since)}),
      board AS (
        SELECT u.id, u.display_name, u.avatar_id, u.avatar_color, u.deletion_at, u.suspended_at,
          p.profile_visibility, p.appear_on_leaderboards, v.value,
          RANK() OVER (ORDER BY v.value DESC) AS rank,
          EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=${user.id}::uuid AND f.followee_id=u.id) AS is_follower_of
        FROM v JOIN users u ON u.id=v.user_id JOIN user_privacy_settings p ON p.user_id=u.id
        WHERE p.appear_on_leaderboards AND u.deletion_at IS NULL AND u.suspended_at IS NULL AND v.value>0 ${scopeSql})`;
    const rows=await tx.$queryRaw`${base} SELECT *, (SELECT count(*) FROM board)::int AS total FROM board ORDER BY value DESC, id ASC LIMIT ${limit} OFFSET ${offset}`;
    const mineRows=await tx.$queryRaw`${base} SELECT value::text, rank::int FROM board WHERE id=${user.id}::uuid`;
    const entries=rows.map(r=>({rank:Number(r.rank),value:Number(r.value),isMe:r.id===user.id,
      ...person(user,r,r.is_follower_of)}));
    return {entries,total:rows[0]?.total||0,me:mineRows[0]?{rank:Number(mineRows[0].rank),value:Number(mineRows[0].value)}:null};
  }
  async function viewerOptedIn(tx,user){
    const row=await tx.userPrivacySetting.findUnique({where:{userId:user.id},select:{appearOnLeaderboards:true}});
    return row?.appearOnLeaderboards===true;
  }

  const leaderboard=(req,q)=>read(req,async(tx,user)=>{
    const now=clock(),season=await activeSeason(tx);
    const period=q.metric==='hexes'?'all':q.period;
    const since=periodStart(period,now,season);
    let teamId=null;
    if(q.scope==='team'){
      const m=await tx.teamMember.findUnique({where:{userId:user.id},select:{teamId:true}});
      if(!m)fail(404,'NO_TEAM','You are not in a team.');
      teamId=m.teamId;
    }
    const empty={entries:[],total:0,me:null};
    const board=period==='season'&&!season?empty:await ranked(tx,user,{...q,period,teamId,since,offset:q.offset});
    return {metric:q.metric,period,scope:q.scope,season:seasonDto(season,now),...board,
      optedIn:await viewerOptedIn(tx,user),limit:q.limit,offset:q.offset};
  });

  const teamBoard=req=>read(req,async(tx,user)=>{
    // Teams ranked by hexes currently held by members who chose to appear on leaderboards.
    const rows=await tx.$queryRaw`
      SELECT t.id::text AS id, t.name, t.color_hex, count(h.h3_index)::int AS hexes, count(DISTINCT tm.user_id)::int AS members
      FROM teams t JOIN team_members tm ON tm.team_id=t.id
      JOIN user_privacy_settings p ON p.user_id=tm.user_id AND p.appear_on_leaderboards
      JOIN users u ON u.id=tm.user_id AND u.deletion_at IS NULL AND u.suspended_at IS NULL
      LEFT JOIN hex_ownership h ON h.owner_id=tm.user_id
      GROUP BY t.id ORDER BY hexes DESC, t.name ASC LIMIT ${MAX_PAGE}`;
    const mine=await tx.teamMember.findUnique({where:{userId:user.id},select:{teamId:true}});
    return {teams:rows.map((r,i)=>({rank:i+1,id:r.id,name:r.name,colorHex:r.color_hex,hexes:r.hexes,members:r.members,isMine:r.id===mine?.teamId}))};
  });

  const currentSeason=req=>read(req,async(tx,user)=>{
    const now=clock(),season=await activeSeason(tx);
    const last=await tx.season.findFirst({where:{status:'ENDED'},orderBy:{endsAt:'desc'}});
    let results=[];
    if(last){
      const rows=await tx.$queryRaw`
        SELECT u.id, u.display_name, u.avatar_id, u.avatar_color, u.deletion_at, u.suspended_at, p.profile_visibility, p.appear_on_leaderboards,
          s.hexes_held, s.distance_m::text AS distance_m, s.final_rank,
          EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=${user.id}::uuid AND f.followee_id=u.id) AS is_follower_of
        FROM season_scores s JOIN users u ON u.id=s.user_id JOIN user_privacy_settings p ON p.user_id=u.id
        WHERE s.season_id=${last.id}::uuid AND p.appear_on_leaderboards AND u.deletion_at IS NULL AND u.suspended_at IS NULL
        ORDER BY s.final_rank ASC, u.id ASC LIMIT 10`;
      results=rows.map(r=>({rank:r.final_rank,hexesHeld:r.hexes_held,distanceM:Number(r.distance_m),isMe:r.id===user.id,...person(user,r,r.is_follower_of)}));
    }
    return {season:seasonDto(season,now),lastSeason:last&&{...seasonDto(last,now),results}};
  });

  // Follows
  const search=(req,{q})=>read(req,async(tx,user)=>{
    const like=q.replace(/[\\%_]/g,m=>'\\'+m)+'%';
    const rows=await tx.$queryRaw`
      SELECT u.id::text AS id, u.display_name, u.avatar_id, u.avatar_color,
        EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=${user.id}::uuid AND f.followee_id=u.id) AS following
      FROM users u JOIN user_privacy_settings p ON p.user_id=u.id
      WHERE p.profile_visibility IN ('PUBLIC','FOLLOWERS') AND u.deletion_at IS NULL AND u.suspended_at IS NULL
        AND u.id<>${user.id}::uuid AND lower(u.display_name) LIKE lower(${like})
      ORDER BY u.display_name ASC, u.id ASC LIMIT 20`;
    return {users:rows.map(r=>({id:r.id,displayName:r.display_name,avatarId:r.avatar_id,avatarColor:r.avatar_color,following:r.following}))};
  });
  async function target(tx,user,id){
    if(id===user.id)fail(400,'INVALID_TARGET','You cannot follow yourself.');
    const row=await tx.user.findUnique({where:{id},select:{id:true,deletionAt:true,suspendedAt:true,privacy:{select:{profileVisibility:true}}}});
    // Private accounts are not discoverable, so they cannot be followed.
    if(!row||row.deletionAt||row.suspendedAt||(row.privacy?.profileVisibility||'PRIVATE')==='PRIVATE')fail(404,'NOT_FOUND','This runner was not found.');
    return row;
  }
  const follow=(req,id)=>read(req,async(tx,user)=>{
    await target(tx,user,id);
    await lockFollows(tx,user.id);
    if(await tx.follow.findUnique({where:{followerId_followeeId:{followerId:user.id,followeeId:id}}}))return {following:true};
    if(await tx.follow.count({where:{followerId:user.id}})>=MAX_FOLLOWING)fail(409,'FOLLOW_LIMIT','You follow the maximum number of runners.');
    await tx.follow.create({data:{followerId:user.id,followeeId:id}});
    return {following:true};
  });
  const unfollow=(req,id)=>read(req,async(tx,user)=>{
    await tx.follow.deleteMany({where:{followerId:user.id,followeeId:id}});
    return {following:false};
  });
  const relations=(kind)=>(req,q)=>read(req,async(tx,user)=>{
    const cur=decode(q.cursor),mineCol=kind==='followers'?Prisma.sql`f.followee_id`:Prisma.sql`f.follower_id`,otherCol=kind==='followers'?Prisma.sql`f.follower_id`:Prisma.sql`f.followee_id`;
    const rows=await tx.$queryRaw`
      SELECT u.id::text AS id, u.display_name, u.avatar_id, u.avatar_color, u.deletion_at, u.suspended_at, p.profile_visibility, f.created_at AS at,
        EXISTS(SELECT 1 FROM follows b WHERE b.follower_id=${user.id}::uuid AND b.followee_id=u.id) AS i_follow
      FROM follows f JOIN users u ON u.id=${otherCol} LEFT JOIN user_privacy_settings p ON p.user_id=u.id
      WHERE ${mineCol}=${user.id}::uuid AND u.deletion_at IS NULL AND u.suspended_at IS NULL
        ${cur?Prisma.sql`AND (f.created_at,u.id)<(${new Date(cur.t)},${cur.id}::uuid)`:Prisma.empty}
      ORDER BY f.created_at DESC, u.id DESC LIMIT ${q.limit+1}`;
    const page=rows.slice(0,q.limit),last=page.at(-1);
    const [{count}]=await tx.$queryRaw`SELECT count(*)::int AS count FROM follows f JOIN users u ON u.id=${otherCol} WHERE ${mineCol}=${user.id}::uuid AND u.deletion_at IS NULL AND u.suspended_at IS NULL`;
    // A follower always sees a name only when the profile rules allow it; here the viewer follows them or they are public.
    return {count,users:page.map(r=>({...person(user,{...r,id:r.id},r.i_follow),following:r.i_follow,since:r.at})),
      nextCursor:rows.length>q.limit?encode({t:last.at.toISOString(),id:last.id}):null};
  });

  const feed=(req,q)=>read(req,async(tx,user)=>{
    const cur=decode(q.cursor);
    const rows=await tx.$queryRaw`
      SELECT r.id::text AS run_id, r.started_at, r.distance_m, r.duration_s,
        u.id::text AS id, u.display_name, u.avatar_id, u.avatar_color, u.deletion_at, u.suspended_at, p.profile_visibility,
        (SELECT count(*)::int FROM run_hexes x WHERE x.run_id=r.id AND x.outcome IN ('CAPTURED','REFRESHED')) AS cells,
        (SELECT count(*)::int FROM run_hexes x WHERE x.run_id=r.id AND x.outcome='CAPTURED') AS captured
      FROM follows f JOIN users u ON u.id=f.followee_id JOIN user_privacy_settings p ON p.user_id=u.id
      JOIN runs r ON r.user_id=u.id
      WHERE f.follower_id=${user.id}::uuid AND r.status='VALID' AND r.deleted_at IS NULL AND r.ended_at IS NOT NULL
        AND u.deletion_at IS NULL AND u.suspended_at IS NULL AND p.profile_visibility IN ('PUBLIC','FOLLOWERS')
        ${cur?Prisma.sql`AND (r.started_at,r.id)<(${new Date(cur.t)},${cur.id}::uuid)`:Prisma.empty}
      ORDER BY r.started_at DESC, r.id DESC LIMIT ${q.limit+1}`;
    const page=rows.slice(0,q.limit),last=page.at(-1);
    return {runs:page.map(r=>({id:r.run_id,startedAt:r.started_at,distanceM:r.distance_m,durationS:r.duration_s,cells:r.cells,captured:r.captured,
      runner:person(user,r,true)})),nextCursor:rows.length>q.limit?encode({t:last.started_at.toISOString(),id:last.run_id}):null};
  });

  // Teams
  const teamDto=(team,role,count,showCode)=>({id:team.id,name:team.name,colorHex:team.colorHex,role,memberCount:count,maxMembers:MAX_TEAM_MEMBERS,
    createdAt:team.createdAt,...(showCode?{inviteCode:team.inviteCode}:{})});
  const myTeam=req=>read(req,async(tx,user)=>{
    const m=await tx.teamMember.findUnique({where:{userId:user.id},include:{team:true}});
    if(!m)return {team:null};
    return {team:teamDto(m.team,m.role,await tx.teamMember.count({where:{teamId:m.teamId}}),true)};
  });
  const createTeam=(req,input)=>prisma.$transaction(async tx=>{
    const user=await currentAccount(tx,req);
    await lockFollows(tx,'team-create:'+user.id);
    if(await tx.teamMember.findUnique({where:{userId:user.id}}))fail(409,'ALREADY_IN_TEAM','Leave your current team first.');
    let team;
    try{team=await tx.team.create({data:{name:input.name,colorHex:input.colorHex,inviteCode:newInviteCode()}});}
    catch(e){if(e.code==='P2002')fail(409,'TEAM_NAME_TAKEN','That team name is taken.');throw e;}
    await tx.teamMember.create({data:{userId:user.id,teamId:team.id,role:'CAPTAIN'}});
    return {team:teamDto(team,'CAPTAIN',1,true)};
  },{timeout:20000});
  const joinTeam=(req,{inviteCode})=>prisma.$transaction(async tx=>{
    const user=await currentAccount(tx,req);
    const team=await tx.team.findUnique({where:{inviteCode}});
    if(!team)fail(404,'INVALID_INVITE','That invite code was not found.');
    await lockTeam(tx,team.id);
    if(!await tx.team.findUnique({where:{id:team.id},select:{id:true}}))fail(404,'INVALID_INVITE','That invite code was not found.');
    if(await tx.teamMember.findUnique({where:{userId:user.id}}))fail(409,'ALREADY_IN_TEAM','Leave your current team first.');
    const count=await tx.teamMember.count({where:{teamId:team.id}});
    if(count>=MAX_TEAM_MEMBERS)fail(409,'TEAM_FULL','This team is full.');
    try{await tx.teamMember.create({data:{userId:user.id,teamId:team.id,role:'MEMBER'}});}
    catch(e){if(e.code==='P2002')fail(409,'ALREADY_IN_TEAM','Leave your current team first.');throw e;}
    return {team:teamDto(team,'MEMBER',count+1,true)};
  },{timeout:20000});
  const leaveTeam=req=>prisma.$transaction(async tx=>{
    const user=await currentAccount(tx,req);
    const m0=await tx.teamMember.findUnique({where:{userId:user.id}});
    if(!m0)fail(404,'NO_TEAM','You are not in a team.');
    await lockTeam(tx,m0.teamId);
    const m=await tx.teamMember.findUnique({where:{userId:user.id}});
    if(!m)fail(404,'NO_TEAM','You are not in a team.');
    await tx.teamMember.delete({where:{userId:user.id}});
    const next=await tx.teamMember.findFirst({where:{teamId:m.teamId},orderBy:[{joinedAt:'asc'},{userId:'asc'}]});
    if(!next)await tx.team.delete({where:{id:m.teamId}});
    else if(m.role==='CAPTAIN')await tx.teamMember.update({where:{userId:next.userId},data:{role:'CAPTAIN'}});
    return {left:true};
  },{timeout:20000});
  const removeMember=(req,id)=>prisma.$transaction(async tx=>{
    const user=await currentAccount(tx,req);
    const me=await tx.teamMember.findUnique({where:{userId:user.id}});
    if(!me||me.role!=='CAPTAIN')fail(403,'FORBIDDEN','Only the team captain can remove members.');
    await lockTeam(tx,me.teamId);
    if(id===user.id)fail(400,'INVALID_TARGET','Use leave team instead.');
    const r=await tx.teamMember.deleteMany({where:{userId:id,teamId:me.teamId}});
    if(!r.count)fail(404,'NOT_FOUND','That member was not found.');
    return {removed:true};
  },{timeout:20000});
  const members=req=>read(req,async(tx,user)=>{
    const m=await tx.teamMember.findUnique({where:{userId:user.id}});
    if(!m)fail(404,'NO_TEAM','You are not in a team.');
    const rows=await tx.$queryRaw`
      SELECT u.id::text AS id, u.display_name, u.avatar_id, u.avatar_color, u.deletion_at, u.suspended_at, p.profile_visibility, tm.role, tm.joined_at,
        EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=${user.id}::uuid AND f.followee_id=u.id) AS is_follower_of,
        (SELECT count(*)::int FROM hex_ownership h WHERE h.owner_id=u.id AND COALESCE(p.appear_on_leaderboards,false)) AS hexes
      FROM team_members tm JOIN users u ON u.id=tm.user_id LEFT JOIN user_privacy_settings p ON p.user_id=u.id
      WHERE tm.team_id=${m.teamId}::uuid AND u.deletion_at IS NULL
      ORDER BY (tm.role='CAPTAIN') DESC, tm.joined_at ASC, u.id ASC LIMIT ${MAX_TEAM_MEMBERS}`;
    return {members:rows.map(r=>({...person(user,r,r.is_follower_of),role:r.role,joinedAt:r.joined_at,isMe:r.id===user.id,hexes:r.id===user.id||r.hexes?r.hexes:null}))};
  });
  return {leaderboard,teamBoard,currentSeason,search,follow,unfollow,followers:relations('followers'),following:relations('following'),feed,
    myTeam,createTeam,joinTeam,leaveTeam,removeMember,members};
}
module.exports={createCommunityService,MAX_TEAM_MEMBERS,MAX_FOLLOWING,MAX_PAGE};
