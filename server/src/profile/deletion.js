'use strict';
const {verifyPassword}=require('../auth/passwords');
const {verifyGoogleIdToken,googleClaims}=require('../auth/google');
const {currentAccount,lockAccountWork,publicError}=require('./common');

function createDeletionService({prisma,config,jobs,exports,mailer,clock=()=>new Date(),verifyGoogle=token=>verifyGoogleIdToken(token,config)}) {
  const denied=()=>publicError(401,'REAUTHENTICATION_REQUIRED','Confirm your password or sign in to Google again to delete this account.');
  async function remove(req,input) {
    if(req.authDeleted){await mailer?.eraseAccount?.(req.authUser.id);return;}
    const before=await prisma.user.findUnique({where:{id:req.authUser.id}});
    if(!before){await mailer?.eraseAccount?.(req.authUser.id);return;}
    let googleSub=null;
    if(input.password!==undefined) {
      if(!await verifyPassword(input.password,before.passwordHash))throw denied();
    } else {
      try {
        const now=clock(),payload=await verifyGoogle(input.idToken),claims=googleClaims(payload,config.googleWebClientId,now);
        if(!Number.isInteger(payload.iat)||now.getTime()/1000-payload.iat>300||payload.iat>now.getTime()/1000+30)throw Error('Fresh token required.');
        googleSub=claims.sub;
      } catch {throw denied();}
    }
    const files=await prisma.$transaction(async tx=>{
      await lockAccountWork(tx,req.authUser.id);
      // All team deletion paths take the team lock before any member user lock.
      // Two members deleting concurrently cannot deadlock or promote a lost row.
      const membership=await tx.teamMember.findUnique({where:{userId:req.authUser.id}});
      if(membership)await tx.$queryRaw`SELECT id FROM teams WHERE id=${membership.teamId}::uuid FOR UPDATE`;
      const user=await currentAccount(tx,req,{allowMissing:true});if(!user)return [];
      if(input.password!==undefined&&user.passwordHash!==before.passwordHash)throw denied();
      if(googleSub&&!await tx.authIdentity.findUnique({where:{provider_providerSubject:{provider:'GOOGLE',providerSubject:googleSub}}})
        .then(identity=>identity?.userId===user.id))throw denied();
      const identities=await tx.authIdentity.findMany({where:{userId:user.id}});
      const names=await tx.displayNameHistory.findMany({where:{userId:user.id},select:{displayName:true}});
      const emails=[...new Set([user.email,...identities.map(row=>row.emailAtSignup)])];
      const identifiers=[user.id,user.username,user.email,user.displayName,...names.map(row=>row.displayName),
        ...identities.flatMap(row=>[row.emailAtSignup,row.providerSubject])].filter(Boolean);
      const context=JSON.stringify({identifiers});
      // Free-text references outside cascading rows also lose known aliases.
      await tx.$executeRaw`UPDATE run_flags SET details=NULL
        WHERE reporter_id=${user.id}::uuid OR resolver_id=${user.id}::uuid
          OR audit_note_mentions_account(details,${context}::jsonb)`;
      await tx.$executeRaw`UPDATE notifications SET title='Account activity',body=NULL
        WHERE user_id<>${user.id}::uuid AND (audit_note_mentions_account(title,${context}::jsonb)
          OR audit_note_mentions_account(body,${context}::jsonb))`;
      await tx.runHex.updateMany({where:{prevOwnerId:user.id},data:{prevOwnerId:null}});
      await tx.loginAttempt.deleteMany({where:{email:{in:emails,mode:'insensitive'}}});
      const activeMembership=await tx.teamMember.findUnique({where:{userId:user.id}});
      if(activeMembership) {
        await tx.teamMember.delete({where:{userId:user.id}});
        const successor=await tx.teamMember.findFirst({where:{teamId:activeMembership.teamId},orderBy:[{joinedAt:'asc'},{userId:'asc'}]});
        if(!successor)await tx.team.delete({where:{id:activeMembership.teamId}});
        else if(activeMembership.role==='CAPTAIN')await tx.teamMember.update({where:{userId:successor.userId},data:{role:'CAPTAIN'}});
      }
      const artifacts=await tx.dataExport.findMany({where:{userId:user.id},select:{id:true}});
      await mailer?.prepareErasure?.({userId:user.id,email:user.email});
      // Root deletion invokes the reviewed audit trigger while identity/history
      // aliases still exist; then cascades tokens, points, consents and keys.
      await tx.user.delete({where:{id:user.id}});
      return artifacts.map(row=>row.id);
    },{timeout:30000});
    await jobs.cancel(req.authUser.id);
    // An unlink failure cannot resurrect data: the key was erased atomically.
    await exports.removeFiles(files).catch(()=>{});
    await mailer?.eraseAccount?.(req.authUser.id);
  }
  return {remove};
}
module.exports={createDeletionService};
