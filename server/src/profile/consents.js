'use strict';
const { currentAccount,publicError } = require('./common');
const { databaseNow } = require('../auth/session-core');

const TYPES=['LOCATION','TERMS','PRIVACY'];
const TEXT={
  LOCATION:{title:'Location processing',text:'During a recorded run we collect GPS points, times, accuracy and speed to draw your route, validate the run and claim territory. Raw points are removed after validation; run summaries and simplified routes remain until you delete them or your account. You can withdraw location consent in Privacy. Recording stops on this phone when you withdraw; you choose what happens to saved points.'},
  TERMS:{title:'Terms of use',text:'Record your own runs, respect other people and restricted places, and use the game safely. Runs with manipulated location data may be rejected. You control your account and can export or delete your live data in Settings.'},
  PRIVACY:{title:'Privacy notice',text:'We store your account, consent choices and recorded activity to run the game. Profile visibility, leaderboards and route sharing are your choices. Your export contains your own data. Account deletion removes live personal data; audit actions remain with your identity redacted. You can change these choices in Settings.'},
};
const recordDto=row=>({...row,id:String(row.id)});
function consentSummary(rows,versions) {
  return TYPES.map(type=>{
    const latest=rows.find(row=>row.type===type)||null;
    const accepted=!!latest?.accepted&&latest.version===versions[type];
    return {type,version:versions[type],accepted,requiresAcceptance:!accepted,
      etag:`"${type}:${latest?latest.id:'none'}"`,latest:latest?recordDto(latest):null,...TEXT[type]};
  });
}
function locationAcceptedAt(rows,time,version) {
  const stamp=new Date(time).getTime();
  if(!Number.isFinite(stamp))return false;
  const ordered=[...rows].filter(row=>row.type==='LOCATION'&&new Date(row.createdAt).getTime()<=stamp)
    .sort((a,b)=>BigInt(a.id)>BigInt(b.id)?-1:BigInt(a.id)<BigInt(b.id)?1:0);
  return ordered[0]?.accepted===true&&ordered[0]?.version===version;
}
function createConsentService({prisma,config}) {
  const versions=config.consentVersions;
  const rows=tx=>userId=>tx.userConsent.findMany({where:{userId},orderBy:{id:'desc'}});
  async function get(req) {
    const history=await rows(prisma)(req.authUser.id);
    return {consents:consentSummary(history,versions),history:history.map(recordDto)};
  }
  async function post(req,input) {
    await prisma.$transaction(async tx=>{
      const user=await currentAccount(tx,req);
      if(input.accepted && input.version!==versions[input.type])
        throw publicError(409,'CONSENT_VERSION_CHANGED','Please read and accept the current version.');
      const latest=await tx.userConsent.findFirst({where:{userId:user.id,type:input.type},orderBy:{id:'desc'}});
      if(latest&&latest.accepted===input.accepted&&latest.version===input.version)return;
      // A stale retry must not re-enable consent after a newer withdrawal.
      // Withdrawal is always allowed; accepting after a recorded state requires
      // the revision from GET. Exact latest-state retries above remain harmless.
      if(input.accepted&&latest&&req.get('if-match')!==`"${input.type}:${latest.id}"`)
        throw publicError(409,'CONSENT_CHANGED','Your consent choices changed. Refresh them before accepting.');
      await tx.userConsent.create({data:{userId:user.id,...input,createdAt:await databaseNow(tx)}});
    });
    return get(req);
  }
  async function recordingPermission(tx,userId) {
    const history=await rows(tx)(userId);
    const consents=consentSummary(history,versions);
    return {allowed:consents.every(row=>row.accepted),consents};
  }
  return {get,post,recordingPermission};
}
module.exports={TYPES,TEXT,recordDto,consentSummary,locationAcceptedAt,createConsentService};
