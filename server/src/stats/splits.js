'use strict';
const {haversine}=require('../runs/math');
const MAX_GAP_MS=30000;
// Splits are derived from stored points; paused or gapped stretches add neither
// distance nor time, so pace reflects moving time only.
function computeSplits(points,unitM){
  const splits=[];let acc=0,accMs=0,prev=null,total=0,totalMs=0;
  for(const p of points){
    if(p.accuracyM>50)continue;
    const stamp=+new Date(p.recordedAt);
    if(!prev){prev={...p,stamp};continue;}
    const dt=stamp-prev.stamp,d=haversine(prev,p);
    if(dt<=0||dt>MAX_GAP_MS||(d>100&&d/(dt/1000)>8.5)){prev={...p,stamp};continue;}
    if(d<Math.max(8,p.accuracyM,prev.accuracyM)){continue;}
    let remainD=d,remainMs=dt;
    while(acc+remainD>=unitM){
      const need=unitM-acc,share=remainMs*(need/remainD);
      splits.push({index:splits.length+1,distanceM:unitM,durationS:Math.round((accMs+share)/1000)});
      remainD-=need;remainMs-=share;acc=0;accMs=0;
    }
    acc+=remainD;accMs+=remainMs;total+=d;totalMs+=dt;prev={...p,stamp};
  }
  if(acc>=50&&accMs>0)splits.push({index:splits.length+1,distanceM:Math.round(acc),durationS:Math.round(accMs/1000),partial:true});
  return {splits,movingDistanceM:Math.round(total),movingDurationS:Math.round(totalMs/1000)};
}
module.exports={computeSplits};
