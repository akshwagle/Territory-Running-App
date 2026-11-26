'use strict';
const {lockAccountWork}=require('../profile/common');
function createRunRetention({prisma,config,clock=()=>new Date()}){
  async function cleanup(){const now=clock(),cutoff=new Date(+now-config.pointRetentionDays*86400000);let cursor;
    for(;;){const candidates=await prisma.run.findMany({where:{OR:[{endedAt:{lte:cutoff}},{deletedAt:{lte:cutoff}}]},select:{id:true,userId:true},orderBy:{id:'asc'},take:50,...(cursor?{cursor:{id:cursor},skip:1}:{})});
      if(!candidates.length)break;
      for(const candidate of candidates)await prisma.$transaction(async tx=>{
        await lockAccountWork(tx,candidate.userId);await tx.$queryRaw`SELECT id FROM runs WHERE id=${candidate.id}::uuid FOR UPDATE`;
        const row=await tx.run.findUnique({where:{id:candidate.id}});if(!row||!((row.endedAt&&row.endedAt<=cutoff)||(row.deletedAt&&row.deletedAt<=cutoff)))return;
        if(row.runSignals.rawPointsPurgedAt)return;
        await tx.runPoint.deleteMany({where:{runId:row.id}});
        const signals={...row.runSignals,pointMeta:{},batches:{},rawPointsPurgedAt:now.toISOString(),segments:(row.runSignals.segments||[]).map(({pausePosition:_pause,resumePosition:_resume,...segment})=>segment)};
        await tx.run.update({where:{id:row.id},data:{runSignals:signals}});
      });cursor=candidates.at(-1).id;
    }
  }
  async function start(){await cleanup();let running=false;const timer=setInterval(()=>{if(running)return;running=true;cleanup().catch(()=>{}).finally(()=>{running=false;});},3600000);timer.unref();return()=>clearInterval(timer);}
  return {cleanup,start};
}
module.exports={createRunRetention};
