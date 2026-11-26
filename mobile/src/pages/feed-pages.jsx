import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/context.jsx';
import { Avatar, Button, Card, EmptyState, ErrorState, Section, Skeleton, StatGrid, StatTile } from '../ui/index.jsx';
import { BarChart, useUnits } from '../stats/pages.jsx';
import { distanceLabel, paceLabel, timeLabel } from '../runs/format.js';
import { Icon } from '../ui/icons.jsx';
import { useUnread } from '../notifications/unread.jsx';
import { useResource } from './settings-pages.jsx';

const whenLabel = iso => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function ActivityCard({ run }) {
  return <article className="feed-post">
    <header className="feed-post-head">
      <Avatar id={run.runner.avatarId} color={run.runner.avatarColor} size={44}/>
      <div className="feed-post-who"><strong dir="auto">{run.runner.displayName}</strong><span>{whenLabel(run.startedAt)} · Territory Run</span></div>
    </header>
    <dl className="feed-stats">
      <div><dt>Distance</dt><dd>{distanceLabel(run.distanceM)}</dd></div>
      <div><dt>Pace</dt><dd>{paceLabel(run.distanceM, run.durationS)}</dd></div>
      <div><dt>Time</dt><dd>{timeLabel(run.durationS)}</dd></div>
    </dl>
    <p className="feed-kudos">{run.captured ? `Captured ${run.captured} hex${run.captured === 1 ? '' : 'es'}` : run.cells ? `Refreshed ${run.cells} hexes` : 'No territory change'}</p>
  </article>;
}

function Feed() {
  const { auth } = useAuth(), [extra, setExtra] = useState({ runs: [], cursor: undefined, busy: false, error: '' });
  const load = useCallback(() => auth.api.request('/api/community/feed?limit=10'), [auth]);
  const data = useResource(load);
  if (data.phase === 'loading' && !data.value) return <Skeleton label="Loading your feed…"/>;
  if (data.phase === 'error' && !data.value) return <ErrorState onRetry={data.reload}>{data.error}</ErrorState>;
  const runs = [...(data.value.runs || []), ...extra.runs], cursor = extra.cursor === undefined ? data.value.nextCursor : extra.cursor;
  const more = async () => {
    setExtra(e => ({ ...e, busy: true, error: '' }));
    try { const r = await auth.api.request(`/api/community/feed?limit=10&cursor=${encodeURIComponent(cursor)}`); setExtra(e => ({ runs: [...e.runs, ...r.runs], cursor: r.nextCursor, busy: false, error: '' })); }
    catch (error) { setExtra(e => ({ ...e, busy: false, error: error?.message || 'Could not load more.' })); }
  };
  if (!runs.length) return <EmptyState title="Nothing here yet" action={<Button to="/community">Find runners to follow</Button>}>Runs from people you follow appear here once they are validated. Only runners with a public or followers-only profile are shown.</EmptyState>;
  return <>{runs.map(r => <ActivityCard key={r.id} run={r}/>)}
    {extra.error && <p role="alert" className="form-error">{extra.error}</p>}
    {cursor && <Button variant="secondary" loading={extra.busy} onClick={more}>Load more</Button>}</>;
}

const greeting = (d = new Date()) => { const h = d.getHours(); return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const localDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function todayStatus(streak, now = new Date()) {
  if (!streak) return '';
  const ran = streak.lastRunOn && String(streak.lastRunOn).slice(0, 10) === localDay(now);
  if (ran) return streak.current > 1 ? `You ran today. ${streak.current}-day streak.` : 'You ran today. Nice work.';
  return streak.current > 0 ? `Run today to keep your ${streak.current}-day streak.` : 'No run yet today.';
}

function StartCard({ status }) {
  return <Card className="home-hero" aria-labelledby="home-start-title">
    <p className="eyebrow">{status || 'Ready when you are'}</p>
    <h2 id="home-start-title">Take a little ground.</h2>
    <Button to="/run" block>Start run</Button>
    <Link className="home-hero-link" to="/map">Open territory map</Link>
  </Card>;
}

function Snapshot() {
  const { auth } = useAuth(), load = useCallback(() => auth.api.request('/api/territory/me?limit=200'), [auth]), data = useResource(load), v = data.value;
  if (data.phase === 'loading' && !v) return <Skeleton shape="stat" label="Loading your territory…"/>;
  if (data.phase === 'error' && !v) return <ErrorState onRetry={data.reload} label="Try again">{data.error}</ErrorState>;
  if (!v.count || !Array.isArray(v.hexes)) return <EmptyState title="No territory yet" action={<Button to="/run" variant="secondary">Start a run</Button>}>Every area you run through becomes yours until someone takes it.</EmptyState>;
  const weekAgo = Date.now() - 7 * 86400000, complete = !v.nextCursor;
  const gained = complete ? v.hexes.filter(h => +new Date(h.claimedAt) >= weekAgo).length : null;
  const cooling = complete ? v.hexes.filter(h => h.onCooldown).length : null;
  return <StatGrid aria-label="Territory snapshot">
    <StatTile label="Hexes held" value={v.count} count/>
    {gained !== null && <StatTile label="Gained this week" value={gained} delta={gained > 0 ? `+${gained}` : undefined} count/>}
    {cooling !== null && <StatTile label="Protected now" value={cooling} count/>}
  </StatGrid>;
}

function WeekChart({ onStatus }) {
  const { auth } = useAuth(), units = useUnits(), load = useCallback(() => auth.api.request('/api/me/stats/overview?range=week'), [auth]), data = useResource(load), v = data.value;
  useEffect(() => { if (v?.streak) onStatus(v.streak); }, [v, onStatus]);
  if (data.phase === 'loading' && !v) return <Skeleton shape="stat" label="Loading this week…"/>;
  if (data.phase === 'error' && !v) return <ErrorState onRetry={data.reload} label="Try again">{data.error}</ErrorState>;
  if (!v.totals?.runs || !Array.isArray(v.series)) return <EmptyState title="No runs this week" action={<Button to="/run" variant="secondary">Start a run</Button>}>Your distance for the last 7 days shows up here after a valid run.</EmptyState>;
  return <><p className="small">{distanceLabel(v.totals.distanceM, units)} in {v.totals.runs} {v.totals.runs === 1 ? 'run' : 'runs'}</p><BarChart series={v.series} bucket={v.bucket} units={units}/></>;
}

export function HomePage() {
  const { state } = useAuth(), unread = useUnread().count, [streak, setStreak] = useState(null), onStatus = useCallback(s => setStreak(s), []);
  return <section className="feed-page">
    <div className="feed-top">
      <div>
        <p className="eyebrow">{greeting()}</p>
        <h1 className="feed-greeting"><bdi>{state.user.displayName}</bdi></h1>
      </div>
      <div className="feed-top-actions">
        <Link className="home-bell" to="/notifications" aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}><Icon name="bell"/>{unread > 0 && <span className="tab-badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}</Link>
        <Link className="home-avatar" to="/you" aria-label="Open your profile"><Avatar id={state.user.avatarId || 0} color={state.user.avatarColor} size={40}/></Link>
      </div>
    </div>
    <StartCard status={todayStatus(streak)}/>
    <Section title="Your territory"><Snapshot/></Section>
    <Section title="This week"><WeekChart onStatus={onStatus}/></Section>
    <div className="feed-heading"><h2>Your feed</h2></div>
    <Feed/>
  </section>;
}
