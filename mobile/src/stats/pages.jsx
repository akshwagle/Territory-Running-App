import {useCallback,useEffect,useState} from 'react';
import {useAuth} from '../auth/context.jsx';
import {Chip,EmptyState,ErrorState,ListRow,Section,Skeleton,Button} from '../ui/index.jsx';
import {useResource} from '../pages/settings-pages.jsx';
import {distanceLabel,timeLabel,paceLabel} from '../runs/format.js';
import {barGeometry,bucketLabel} from './chart.js';

export function useUnits(){const {auth}=useAuth(),[units,setUnits]=useState('km');useEffect(()=>{let live=true;auth.api.request('/api/me/profile').then(d=>{if(live&&['km','mi'].includes(d.profile.preferredUnits))setUnits(d.profile.preferredUnits);}).catch(()=>{});return()=>{live=false;};},[auth]);return units;}
const RANGES=[['week','7 days'],['month','30 days'],['year','12 months']];
const dateText=v=>new Date(v).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});

export function BarChart({series,bucket,units}){
  const bars=barGeometry(series),per=units==='mi'?1609.344:1000,sum=series.reduce((a,s)=>a+s.distanceM,0);
  const step=bucket==='day'&&series.length>7?Math.ceil(series.length/6):1;
  return <figure className="stat-chart"><svg viewBox="0 0 300 140" role="img" aria-label={`Distance per ${bucket}, ${(sum/per).toFixed(1)} ${units} in total`} preserveAspectRatio="none">
    <line x1="0" y1="139.5" x2="300" y2="139.5" className="stat-axis"/>
    {bars.map((b,i)=><rect key={series[i].start} x={b.x} y={b.y} width={b.width} height={b.height} rx="2" className="stat-bar"><title>{`${bucketLabel(series[i].start,bucket)}: ${(b.value/per).toFixed(2)} ${units}`}</title></rect>)}
  </svg>
  <div className="stat-labels" aria-hidden="true">{series.map((s,i)=><span key={s.start}>{i%step===0?bucketLabel(s.start,bucket):''}</span>)}</div></figure>;
}
function Tile({label,value}){return <div><dt>{label}</dt><dd>{value}</dd></div>;}
function Overview({units}){
  const {auth}=useAuth(),[range,setRange]=useState('week'),load=useCallback(()=>auth.api.request(`/api/me/stats/overview?range=${range}`),[auth,range]),data=useResource(load),v=data.value;
  return <>
    <div className="sport-chips" role="group" aria-label="Period">{RANGES.map(([key,label])=><Chip key={key} selected={range===key} onClick={()=>setRange(key)}>{label}</Chip>)}</div>
    {data.phase==='loading'&&!v&&<Skeleton label="Loading your stats…"/>}
    {data.phase==='error'&&<ErrorState onRetry={data.reload} label="Try again">{data.error}</ErrorState>}
    {v&&(v.lifetime.runs===0?<EmptyState title="No stats yet" action={<Button to="/run">Start a run</Button>}>Validated runs show up here with distance, time and pace.</EmptyState>:<>
      <dl className="ui-run-stats"><Tile label="Distance" value={distanceLabel(v.totals.distanceM,units)}/><Tile label="Time" value={timeLabel(v.totals.durationS)}/><Tile label="Avg pace" value={paceLabel(v.totals.distanceM,v.totals.durationS,units)}/></dl>
      <p className="small">{v.totals.runs} {v.totals.runs===1?'run':'runs'} in this period · {v.lifetime.runs} all time ({distanceLabel(v.lifetime.distanceM,units)})</p>
      <BarChart series={v.series} bucket={v.bucket} units={units}/>
      <Section title="Streak"><ListRow label="Current streak" value={`${v.streak.current} ${v.streak.current===1?'day':'days'}`}/><ListRow label="Best streak" value={`${v.streak.best} ${v.streak.best===1?'day':'days'}`}/></Section></>)}
  </>;
}
function RecordRow({label,rec,detail}){
  return rec?<ListRow to={`/run/history/${rec.runId}`} label={label} value={detail(rec)}><small>{dateText(rec.startedAt)}</small></ListRow>:<ListRow label={label} value="—"/>;
}
function Records({units}){
  const {auth}=useAuth(),load=useCallback(()=>auth.api.request('/api/me/stats/records'),[auth]),data=useResource(load),r=data.value;
  const pace=rec=>`${timeLabel(rec.durationS)} · ${paceLabel(rec.distanceM,rec.durationS,units)}`;
  return <>{data.phase==='loading'&&!r&&<Skeleton label="Loading records…"/>}{data.phase==='error'&&<ErrorState onRetry={data.reload} label="Try again">{data.error}</ErrorState>}
    {r&&(!r.longestDistance?<EmptyState title="No records yet">Finish a validated run and your bests appear here.</EmptyState>:<>
      <Section title="Distance and time"><RecordRow label="Longest run" rec={r.longestDistance} detail={x=>distanceLabel(x.distanceM,units)}/><RecordRow label="Longest time" rec={r.longestDuration} detail={x=>timeLabel(x.durationS)}/>
        {r.bestWeek&&<ListRow label="Best week" value={distanceLabel(r.bestWeek.distanceM,units)}><small>Week of {dateText(r.bestWeek.weekStart)}</small></ListRow>}
        <ListRow label="Best streak" value={`${r.bestStreakDays} ${r.bestStreakDays===1?'day':'days'}`}/></Section>
      <Section title="Fastest pace by run length"><RecordRow label="1 km or more" rec={r.fastest['1k']} detail={pace}/><RecordRow label="5 km or more" rec={r.fastest['5k']} detail={pace}/>
        <RecordRow label="10 km or more" rec={r.fastest['10k']} detail={pace}/><RecordRow label="Half marathon or more" rec={r.fastest.half} detail={pace}/></Section>
      {r.mostCellsInRun&&<Section title="Territory"><ListRow to={`/run/history/${r.mostCellsInRun.runId}`} label="Most cells in one run" value={String(r.mostCellsInRun.cells)}><small>{dateText(r.mostCellsInRun.startedAt)}</small></ListRow></Section>}
      <p className="small">Fastest pace is the best average over a whole run of at least that distance.</p></>)}</>;
}
function Achievements(){
  const {auth}=useAuth(),load=useCallback(()=>auth.api.request('/api/me/stats/achievements'),[auth]),data=useResource(load),list=data.value?.badges;
  return <>{data.phase==='loading'&&!list&&<Skeleton label="Loading achievements…"/>}{data.phase==='error'&&<ErrorState onRetry={data.reload} label="Try again">{data.error}</ErrorState>}
    {list&&!list.length&&<EmptyState title="No achievements available">Badges will appear here when they are published.</EmptyState>}
    {list?.length>0&&<Section>{list.map(b=><div className={`badge-row${b.earned?' earned':''}`} key={b.id}>
      <div><strong>{b.name}</strong>{b.description&&<p className="small">{b.description}</p>}</div>
      <div className="badge-progress"><progress max={b.threshold} value={b.progress} aria-label={`${b.name} progress`}/><span className="small">{b.earned?'Earned':`${b.progress} / ${b.threshold} ${b.unit}`}</span></div></div>)}</Section>}</>;
}
const TABS=[['stats','Stats'],['records','Records'],['achievements','Badges']];
export function StatsPage(){
  const units=useUnits(),[tab,setTab]=useState('stats');
  return <section><p className="eyebrow">Your progress</p><h1>Stats</h1>
    <div className="sport-chips" role="tablist" aria-label="Stats sections">{TABS.map(([key,label])=><Chip key={key} role="tab" aria-selected={tab===key} selected={tab===key} onClick={()=>setTab(key)}>{label}</Chip>)}</div>
    {tab==='stats'&&<Overview units={units}/>}{tab==='records'&&<Records units={units}/>}{tab==='achievements'&&<Achievements/>}
    <Section><ListRow to="/run/history" label="Run history"/></Section></section>;
}
export function Splits({runId,units}){
  const {auth}=useAuth(),load=useCallback(()=>auth.api.request(`/api/me/run-splits/${runId}?unit=${units}`),[auth,runId,units]),data=useResource(load),s=data.value?.splits;
  if(data.phase==='error')return <ErrorState onRetry={data.reload} label="Try again">{data.error}</ErrorState>;
  if(!s)return <Skeleton label="Loading splits…"/>;
  if(!s.length)return null;
  const fastest=Math.min(...s.filter(x=>!x.partial).map(x=>x.durationS/x.distanceM),Infinity);
  return <Section title={`Splits (${units})`}>{s.map(x=><ListRow key={x.index} label={x.partial?`${(x.distanceM/(units==='mi'?1609.344:1000)).toFixed(2)} ${units}`:`${units} ${x.index}`} value={paceLabel(x.distanceM,x.durationS,units)}>
    {!x.partial&&x.durationS/x.distanceM===fastest&&s.length>2&&<small>Fastest split</small>}</ListRow>)}</Section>;
}
