'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomBytes,createCipheriv,createDecipheriv}=require('node:crypto');
const {currentAccount,lockAccountWork,publicError}=require('./common');
const {databaseNow}=require('../auth/session-core');
const {recordDto}=require('./consents');
const {privacyDto}=require('./privacy');

const dto=row=>({id:row.id,status:row.status,createdAt:row.createdAt,expiresAt:row.expiresAt});
const notificationTitles={HEX_LOST:'Territory changed',RUN_VALIDATED:'Run validated',RUN_FLAGGED:'Run flagged',BADGE_EARNED:'Badge earned',SEASON_ENDED:'Season ended',SYSTEM:'System notification'};
const stringify=value=>JSON.stringify(value,(_key,item)=>typeof item==='bigint'?String(item):item,2);
function encrypt(value,key) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key),iv);
  const ciphertext=Buffer.concat([cipher.update(stringify(value),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),ciphertext]);
}
function decrypt(buffer,key) {
  const cipher=createDecipheriv('aes-256-gcm',Buffer.from(key),buffer.subarray(0,12));
  cipher.setAuthTag(buffer.subarray(12,28));
  return JSON.parse(Buffer.concat([cipher.update(buffer.subarray(28)),cipher.final()]).toString('utf8'));
}

async function ownData(tx,userId) {
  // Explicit projections exclude passwords, hashes, session tokens, export keys,
  // push tokens, team invite codes and other people's coordinates/identities.
  const profile=await tx.user.findUnique({where:{id:userId},select:{id:true,username:true,email:true,displayName:true,
    avatarId:true,avatarColor:true,preferredUnits:true,bio:true,homeRegionId:true,createdAt:true,verifiedAt:true}});
  const privacy=await tx.userPrivacySetting.findUnique({where:{userId}});
  const consents=await tx.userConsent.findMany({where:{userId},orderBy:{id:'asc'},select:{id:true,type:true,version:true,accepted:true,createdAt:true}});
  const runs=await tx.run.findMany({where:{userId},orderBy:{startedAt:'asc'},select:{id:true,clientRunId:true,startedAt:true,endedAt:true,
    distanceM:true,durationS:true,routePolyline:true,h3Resolution:true,status:true,mockGps:true,appVersion:true,createdAt:true,
    points:{orderBy:{seq:'asc'},select:{seq:true,lat:true,lng:true,recordedAt:true,accuracyM:true,speedMps:true}},
    hexes:{select:{h3Index:true,outcome:true,prevOwnerId:true,createdAt:true}}}});
  runs.forEach(run=>{run.hexes=run.hexes.map(({prevOwnerId,...hex})=>({...hex,previousOwner:prevOwnerId===null?null:prevOwnerId===userId?'You':'Runner'}));});
  const flags=await tx.runFlag.findMany({where:{OR:[{run:{userId}},{reporterId:userId},{resolverId:userId}]},
    select:{id:true,runId:true,run:{select:{userId:true}},reason:true,status:true,createdAt:true,resolvedAt:true,reporterId:true,resolverId:true}});
  const membership=await tx.teamMember.findUnique({where:{userId},select:{role:true,joinedAt:true,team:{select:{id:true,name:true,colorHex:true,createdAt:true}}}});
  const notifications=await tx.notification.findMany({where:{userId},orderBy:{createdAt:'asc'},select:{id:true,type:true,title:true,body:true,createdAt:true,readAt:true}});
  return {formatVersion:1,profile,privacy:privacy?{...privacyDto(privacy),homeHex:privacy.homeHex,hideRadiusM:privacy.hideRadiusM}:{profileVisibility:'PRIVATE',appearOnLeaderboards:false,shareRouteShapes:false},
    consents:consents.map(recordDto),runs,
    flags:flags.map(({run,runId,reporterId,resolverId,...flag})=>({...flag,runId:run.userId===userId?runId:null,
      runner:run.userId===userId?'You':'Runner',reporter:reporterId===null?null:reporterId===userId?'You':'Runner',
      resolver:resolverId===null?null:resolverId===userId?'You':'Runner'})),
    teams:membership?[membership]:[],notifications:notifications.map(row=>({...row,title:notificationTitles[row.type],body:row.type==='HEX_LOST'?'Runner captured territory you held.':null})),
    redactions:'Other runners are labelled Runner. Flag and notification free text is omitted because it can identify other people. Team member lists, invite codes and authentication secrets are excluded.'};
}

function createExportService({prisma,jobs,directory=path.resolve(__dirname,'../../storage/exports'),clock=()=>new Date(),cleanupAdditional=async()=>{}}) {
  const file=id=>path.join(directory,`${id}.enc`);
  async function prepare(){await fs.mkdir(directory,{recursive:true,mode:0o700});await fs.chmod(directory,0o700);}
  const unlink=async id=>fs.rm(file(id),{force:true});
  async function build(userId,id,signal) {
    await prepare();
    try {
      await prisma.$transaction(async tx=>{
        await lockAccountWork(tx,userId);
        const user=await tx.user.findUnique({where:{id:userId},select:{id:true}});
        const row=await tx.dataExport.findFirst({where:{id,userId,status:'PENDING',expiresAt:{gt:clock()}}});
        if(!user||!row||signal.aborted)return;
        const payload=await ownData(tx,userId);
        if(signal.aborted)return;
        // Atomic publication is serialized with deletion. A crash can leave only
        // ciphertext; deleting metadata destroys its sole persisted key.
        const temp=path.join(directory,`${id}.tmp`);
        try {await fs.writeFile(temp,encrypt(payload,row.encryptionKey),{mode:0o600,flag:'wx'});await fs.rename(temp,file(id));}
        finally {await fs.rm(temp,{force:true});}
        await tx.dataExport.update({where:{id},data:{status:'READY',completedAt:await databaseNow(tx)}});
      },{timeout:30000});
    } catch {
      await unlink(id);
      await prisma.dataExport.updateMany({where:{id,userId,status:'PENDING'},data:{status:'FAILED',completedAt:clock()}});
      throw Error('Export could not be prepared.');
    }
  }
  async function create(req) {
    const row=await prisma.$transaction(async tx=>{
      await lockAccountWork(tx,req.authUser.id);const user=await currentAccount(tx,req);const now=await databaseNow(tx);
      const expired=await tx.dataExport.findMany({where:{userId:user.id,expiresAt:{lte:now}},select:{id:true}});
      await tx.dataExport.deleteMany({where:{userId:user.id,expiresAt:{lte:now}}});
      for(const item of expired)await unlink(item.id);
      const existing=await tx.dataExport.findFirst({where:{userId:user.id,status:{in:['PENDING','READY']}}});
      if(existing)return existing;
      return tx.dataExport.create({data:{userId:user.id,encryptionKey:randomBytes(32),createdAt:now,expiresAt:new Date(now.getTime()+24*3600000)}});
    });
    if(row.status==='PENDING')jobs.enqueue(req.authUser.id,signal=>build(req.authUser.id,row.id,signal));
    return {export:dto(row)};
  }
  async function get(req,id) {
    if(req.authDeleted)throw publicError(404,'NOT_FOUND','The requested export was not found.');
    const result=await prisma.$transaction(async tx=>{
      await lockAccountWork(tx,req.authUser.id);await currentAccount(tx,req);
      const row=await tx.dataExport.findFirst({where:{id,userId:req.authUser.id,expiresAt:{gt:clock()}}});
      if(!row)throw publicError(404,'NOT_FOUND','The requested export was not found or has expired.');
      if(row.status==='PENDING')return {pending:true,export:dto(row)};
      if(row.status==='FAILED')throw publicError(409,'EXPORT_FAILED','The export could not be prepared. Request a new one.');
      try {return {data:decrypt(await fs.readFile(file(row.id)),row.encryptionKey)};}
      catch {
        await tx.dataExport.update({where:{id},data:{status:'FAILED',completedAt:await databaseNow(tx)}});
        return {unavailable:true};
      }
    });
    if(result.unavailable)throw publicError(404,'NOT_FOUND','This export is no longer available. Request a new one.');
    return result;
  }
  async function removeFiles(ids){for(const id of ids)await unlink(id);}
  async function cleanup() {
    await prepare();
    const expired=await prisma.dataExport.findMany({where:{expiresAt:{lte:clock()}},select:{id:true,userId:true}});
    for(const row of expired)await prisma.$transaction(async tx=>{
      await lockAccountWork(tx,row.userId);
      const removed=await tx.dataExport.deleteMany({where:{id:row.id,expiresAt:{lte:clock()}}});
      if(removed.count)await unlink(row.id);
    });
      // Only UUID filenames created by this service; never recurse into a user path.
    for(const name of await fs.readdir(directory))if(/^[0-9a-f-]{36}\.(enc|tmp)$/.test(name)) {
      // Recheck each ID after listing: a stale catalog snapshot must not unlink
      // a newly published export from another process. IDs are server UUIDs.
      if(!await prisma.dataExport.findUnique({where:{id:name.slice(0,36)},select:{id:true}}))
        await fs.rm(path.join(directory,name),{force:true});
    }
    await cleanupAdditional();
  }
  async function start() {
    await cleanup();
    for(const row of await prisma.dataExport.findMany({where:{status:'PENDING'},select:{id:true,userId:true}}))
      jobs.enqueue(row.userId,signal=>build(row.userId,row.id,signal));
    const timer=setInterval(()=>cleanup().catch(()=>{}),3600000);timer.unref();return ()=>clearInterval(timer);
  }
  return {create,get,cleanup,start,removeFiles,directory};
}
module.exports={createExportService,ownData,encrypt,decrypt};
