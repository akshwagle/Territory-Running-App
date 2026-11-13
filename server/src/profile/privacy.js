'use strict';
const { currentAccount } = require('./common');

function canView(viewer,target,{isFollower=false}={}) {
  if (!target || target.deletionAt || target.suspendedAt) return false;
  if (viewer?.id === target.id) return true;
  const visibility=target.privacy?.profileVisibility || 'PRIVATE';
  return visibility === 'PUBLIC' || (visibility === 'FOLLOWERS' && Boolean(viewer?.id && isFollower));
}
function mapIdentity(viewer,target,relation) {
  return {id:target.id,displayName:canView(viewer,target,relation)?target.displayName:'Runner'};
}
function leaderboardIdentity(viewer,target,relation) {
  return target.privacy?.appearOnLeaderboards ? mapIdentity(viewer,target,relation) : null;
}
const privacyDto=row=>({profileVisibility:row.profileVisibility,appearOnLeaderboards:row.appearOnLeaderboards,shareRouteShapes:!row.hideRoute});
function createPrivacyService({prisma}) {
  const get=req=>prisma.$transaction(async tx=>{
    const user=await currentAccount(tx,req);
    const row=await tx.userPrivacySetting.upsert({where:{userId:user.id},create:{userId:user.id},update:{}});
    return {privacy:privacyDto(row)};
  });
  const patch=(req,input)=>prisma.$transaction(async tx=>{
    const user=await currentAccount(tx,req);
    const data={};
    if(input.profileVisibility!==undefined)data.profileVisibility=input.profileVisibility;
    if(input.appearOnLeaderboards!==undefined)data.appearOnLeaderboards=input.appearOnLeaderboards;
    if(input.shareRouteShapes!==undefined)data.hideRoute=!input.shareRouteShapes;
    const row=await tx.userPrivacySetting.upsert({where:{userId:user.id},create:{userId:user.id,...data},update:data});
    return {privacy:privacyDto(row)};
  });
  return {get,patch};
}
module.exports={canView,mapIdentity,leaderboardIdentity,privacyDto,createPrivacyService};
