'use strict';
const { currentAccount,publicError } = require('./common');
const { allocateDisplayName,recordDisplayNameChange } = require('./names');
const { canView } = require('./privacy');

const AVATAR_IDS=Object.freeze(Array.from({length:12},(_,i)=>i));
const AVATAR_COLORS=Object.freeze(['#1F5A46','#B8452A','#14392C','#5A5F58','#1F2421']);
const select={id:true,displayName:true,avatarId:true,avatarColor:true,preferredUnits:true,bio:true,homeRegionId:true,
  homeRegion:{select:{id:true,name:true,city:true}}};

function createProfileService({prisma}) {
  async function get(req) {
    const profile=await prisma.user.findUnique({where:{id:req.authUser.id},select});
    if(!profile)throw publicError(404,'NOT_FOUND','The requested profile was not found.');
    const regions=await prisma.region.findMany({select:{id:true,name:true,city:true},orderBy:[{city:'asc'},{name:'asc'},{id:'asc'}]});
    return {profile,options:{avatarIds:AVATAR_IDS,avatarColors:AVATAR_COLORS,preferredUnits:['km','mi']},regions};
  }
  async function patch(req,input) {
    await prisma.$transaction(async tx=>{
      const user=await currentAccount(tx,req),data={...input};
      if(input.displayName!==undefined) {
        data.displayName=await allocateDisplayName(tx,input.displayName,user.id,false);
        await recordDisplayNameChange(tx,user,data.displayName);
      }
      if(input.homeRegionId && !await tx.region.findUnique({where:{id:input.homeRegionId},select:{id:true}}))
        throw publicError(404,'REGION_NOT_FOUND','Choose an available home region.');
      await tx.user.update({where:{id:user.id},data});
    });
    return get(req);
  }
  async function publicProfile(req,id) {
    const target=await prisma.user.findUnique({where:{id},select:{...select,deletionAt:true,suspendedAt:true,
      privacy:{select:{profileVisibility:true}},followers:{where:{followerId:req.authUser.id},select:{followerId:true},take:1}}});
    if(!canView(req.authUser,target,{isFollower:!!target?.followers.length}))
      throw publicError(404,'NOT_FOUND','The requested profile was not found.');
    const {deletionAt:_deleted,suspendedAt:_suspended,privacy:_privacy,followers:_followers,...profile}=target;
    return {profile};
  }
  async function history(req,id) {
    if(req.authRole!=='ADMIN')throw publicError(403,'FORBIDDEN','Administrator access is required.');
    if(!await prisma.user.findUnique({where:{id},select:{id:true}}))throw publicError(404,'NOT_FOUND','The requested account was not found.');
    return {history:await prisma.displayNameHistory.findMany({where:{userId:id},select:{id:true,displayName:true,changedAt:true,reservedUntil:true},orderBy:[{changedAt:'desc'},{id:'desc'}]})};
  }
  return {get,patch,publicProfile,history};
}
module.exports={AVATAR_IDS,AVATAR_COLORS,createProfileService};
