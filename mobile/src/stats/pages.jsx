import {useCallback,useEffect,useState} from 'react';
import {useAuth} from '../auth/context.jsx';
import {Chip,EmptyState,ErrorState,ListRow,Section,Skeleton,Button,StatGrid,StatTile,Icon} from '../ui/index.jsx';
import {tap} from '../ui/haptics.js';
import {useResource} from '../pages/use-resource.js';
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
function Overview({units}){
  const {auth}=useAuth(),[range,setRange]=useState('week'),load=useCallback(()=>auth.api.request(`/api/me/stats/overview?range=${range}`),[auth,range]),data=useResource(load),v=data.value;
  return <>
    <div className="sport-chips" role="group" aria-label="Period">{RANGES.map(([key,label])=><Chip key={key} selected={range===key} onClick={()=>setRange(key)}>{label}</Chip>)}</div>
    {data.phase==='loading'&&!v&&<Skeleton label="Loading your stats…"/>}
    {data.phase==='error'&&<ErrorState onRetry={data.reload} label="Try again">{data.error}</ErrorState>}
    {v&&(v.lifetime.runs===0?<EmptyState title="Your stats start with a run" action={<Button to="/run">Start a run</Button>}>Distance, time, pace and streaks fill in after your first valid run.</EmptyState>:<>
      <StatGrid><StatTile tone="accent" label="Distance" value={distanceLabel(v.totals.distanceM,units)}/><StatTile label="Time" value={timeLabel(v.totals.durationS)}/><StatTile label="Avg pace" value={paceLabel(v.totals.distanceM,v.totals.durationS,units)}/><StatTile label="Runs" value={v.totals.runs}/></StatGrid>
      <p className="small">{v.lifetime.runs} {v.lifetime.runs===1?'run':'runs'} all time ({distanceLabel(v.lifetime.distanceM,units)})</p>
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
const SEEN_KEY='tr.badges.seen';
function readSeen(){try{const v=JSON.parse(globalThis.localStorage?.getItem(SEEN_KEY)||'null');return Array.isArray(v)?v:null;}catch{return null;}}
function writeSeen(ids){try{globalThis.localStorage?.setItem(SEEN_KEY,JSON.stringify(ids));}catch{/* storage is optional */}}
// Badges earned since the last visit; the first visit only records the baseline so old badges never replay.
export function newlyEarned(list,seen){return seen?list.filter(b=>b.earned&&!seen.includes(b.id)):[];}
function BadgeTile({b,fresh}){
  const pct=b.threshold>0?Math.min(100,Math.round(b.progress/b.threshold*100)):0;
  return <li className={`badge-tile${b.earned?' earned':''}${fresh?' fresh':''}`}>
    <span className="badge-icon" aria-hidden="true"><Icon name={b.earned?'trophy':'target'}/></span>
    <strong>{b.name}</strong>{b.description&&<span className="small">{b.description}</span>}
    {b.earned?<span className="small badge-state">Earned</span>:<><progress max={b.threshold} value={b.progress} aria-label={`${b.name} progress`}/><span className="small badge-state">{`${b.progress} / ${b.threshold} ${b.unit}`}<span className="sr-only"> ({pct}%)</span></span></>}</li>;
}
function Achievements(){
  const {auth}=useAuth(),load=useCallback(()=>auth.api.request('/api/me/stats/achievements'),[auth]),data=useResource(load),list=data.value?.badges;
  const [fresh,setFresh]=useState([]);
  useEffect(()=>{if(!list)return;const found=newlyEarned(list,readSeen());writeSeen(list.filter(b=>b.earned).map(b=>b.id));if(found.length){setFresh(found);tap('confirm');}},[list]);
  const earned=list?.filter(b=>b.earned)||[],open=list?.filter(b=>!b.earned)||[],isFresh=id=>fresh.some(f=>f.id===id);
  return <>{data.phase==='loading'&&!list&&<Skeleton label="Loading achievements…"/>}{data.phase==='error'&&<ErrorState onRetry={data.reload} label="Try again">{data.error}</ErrorState>}
    {fresh.length>0&&<div className="badge-celebrate" role="status"><span>{fresh.length===1?`New badge: ${fresh[0].name}`:`${fresh.length} new badges earned`}</span><Button variant="ghost" size="sm" onClick={()=>setFresh([])}>Dismiss</Button></div>}
    {list&&!list.length&&<EmptyState title="No achievements available">Badges will appear here when they are published.</EmptyState>}
    {earned.length>0&&<Section title={`Earned (${earned.length})`}><ul className="badge-grid">{earned.map(b=><BadgeTile key={b.id} b={b} fresh={isFresh(b.id)}/>)}</ul></Section>}
    {open.length>0&&<Section title={earned.length?'Still to earn':'Keep going'}><ul className="badge-grid">{open.map(b=><BadgeTile key={b.id} b={b}/>)}</ul></Section>}</>;
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
