// Pure helpers for the SVG bar chart; kept separate so they are unit-testable.
export function barGeometry(series,{width=300,height=140,pad=4,metric='distanceM'}={}){
  const values=series.map(s=>Math.max(0,s[metric]||0)),max=Math.max(...values,1),slot=width/Math.max(series.length,1),barW=Math.max(2,slot-pad);
  return values.map((v,i)=>{const h=v>0?Math.max(2,Math.round(v/max*height)):0;return {x:+(i*slot+pad/2).toFixed(2),y:height-h,width:+barW.toFixed(2),height:h,value:v};});
}
export function bucketLabel(start,bucket,locale){
  const d=new Date(start);
  return bucket==='month'?d.toLocaleDateString(locale,{month:'short',timeZone:'UTC'}):d.toLocaleDateString(locale,{weekday:'short',day:'numeric',timeZone:'UTC'});
}
export function shareText(run,units,{distanceLabel,timeLabel,paceLabel}){
  const day=new Date(run.startedAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
  return `Territory Run · ${day}\n${distanceLabel(run.distanceM,units)} in ${timeLabel(run.durationS)} (${paceLabel(run.distanceM,run.durationS,units)})`;
}
export function historyQuery(filter,now=new Date()){
  const q=new URLSearchParams({active:'false',limit:'20'}),day=86400000;
  if(filter.period==='7d')q.set('from',new Date(+now-7*day).toISOString());
  if(filter.period==='30d')q.set('from',new Date(+now-30*day).toISOString());
  if(filter.period==='year')q.set('from',new Date(Date.UTC(now.getUTCFullYear(),0,1)).toISOString());
  if(filter.distance==='short')q.set('maxDistanceM','4999');
  if(filter.distance==='mid'){q.set('minDistanceM','5000');q.set('maxDistanceM','9999');}
  if(filter.distance==='long')q.set('minDistanceM','10000');
  if(filter.status)q.set('status',filter.status);
  return q;
}
