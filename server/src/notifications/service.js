'use strict';
const {currentAccount,publicError}=require('../profile/common');
const {awardBadges}=require('./badges');
const fail=(s,c,m)=>{throw publicError(s,c,m);};
const MAX_PAGE=50;
const dto=n=>({id:n.id,type:n.type,title:n.title,body:n.body,read:!!n.readAt,createdAt:n.createdAt});
// Creates a notification only for an account that still exists and is not
// being deleted or suspended. Never throws on a missing recipient.
async function notify(tx,userId,{type,title,body=null}){
  const u=await tx.user.findUnique({where:{id:userId},select:{deletionAt:true,suspendedAt:true}});
  if(!u||u.deletionAt||u.suspendedAt)return false;
  await tx.notification.create({data:{userId,type,title:title.slice(0,100),body:body&&body.slice(0,300)}});
  return true;
}
// Called inside the finish transaction, after the final run status is written.
// Privacy: territory-lost notices never name the runner who captured cells.
async function runCompleted(tx,run,verdict,distanceM){
  const km=(distanceM/1000).toFixed(2);
  let earned=[];
  if(verdict.status==='VALID'){
    const hexes=await tx.runHex.groupBy({by:['outcome'],where:{runId:run.id},_count:{_all:true}});
    const n=o=>hexes.find(h=>h.outcome===o)?._count._all||0,cap=n('CAPTURED'),ref=n('REFRESHED');
    await notify(tx,run.userId,{type:'RUN_VALIDATED',title:'Run counted',body:`${km} km. ${cap} cells captured, ${ref} refreshed.`});
    const lost=await tx.runHex.groupBy({by:['prevOwnerId'],where:{runId:run.id,outcome:'CAPTURED',prevOwnerId:{not:null}},_count:{_all:true}});
    for(const l of lost){
      if(l.prevOwnerId===run.userId)continue;
      await notify(tx,l.prevOwnerId,{type:'HEX_LOST',title:'Territory lost',body:`${l._count._all} of your cells ${l._count._all===1?'was':'were'} captured by another runner.`});
    }
    earned=await awardBadges(tx,run.userId);
  }else if(verdict.status==='FLAGGED')await notify(tx,run.userId,{type:'RUN_FLAGGED',title:'Run needs review',body:'Your run was held for review and did not claim territory.'});
  else await notify(tx,run.userId,{type:'SYSTEM',title:'Run not counted',body:'This run was too short to claim territory.'});
  return earned;
}
function createNotificationService({prisma}){
  const tx=(req,task)=>prisma.$transaction(async t=>task(t,await currentAccount(t,req)),{timeout:20000});
  const list=(req,{limit,cursor,unread})=>tx(req,async(t,user)=>{
    let before=null;
    if(cursor){const [ts,id]=String(cursor).split('_');before={createdAt:new Date(ts),id};if(Number.isNaN(+before.createdAt)||!/^[0-9a-f-]{36}$/.test(id||''))fail(400,'INVALID_CURSOR','Refresh and try again.');}
    const rows=await t.notification.findMany({where:{userId:user.id,...(unread?{readAt:null}:{}),...(before?{OR:[{createdAt:{lt:before.createdAt}},{createdAt:before.createdAt,id:{lt:before.id}}]}:{})},
      orderBy:[{createdAt:'desc'},{id:'desc'}],take:Math.min(limit||20,MAX_PAGE)+1});
    const size=Math.min(limit||20,MAX_PAGE),page=rows.slice(0,size),last=page.at(-1);
    return {notifications:page.map(dto),nextCursor:rows.length>size&&last?`${last.createdAt.toISOString()}_${last.id}`:null,unreadCount:await t.notification.count({where:{userId:user.id,readAt:null}})};
  });
  const unreadCount=req=>tx(req,async(t,user)=>({unreadCount:await t.notification.count({where:{userId:user.id,readAt:null}})}));
  const markRead=(req,id)=>tx(req,async(t,user)=>{
    const row=await t.notification.findFirst({where:{id,userId:user.id},select:{id:true}});
    if(!row)fail(404,'NOT_FOUND','This notification was not found.');
    await t.notification.updateMany({where:{id,userId:user.id,readAt:null},data:{readAt:new Date()}});
    return {unreadCount:await t.notification.count({where:{userId:user.id,readAt:null}})};
  });
  const markAllRead=req=>tx(req,async(t,user)=>{await t.notification.updateMany({where:{userId:user.id,readAt:null},data:{readAt:new Date()}});return {unreadCount:0};});
  return {list,unreadCount,markRead,markAllRead};
}
module.exports={createNotificationService,notify,runCompleted};
