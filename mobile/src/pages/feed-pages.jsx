import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/context.jsx';
import { Avatar, Button, EmptyState, ErrorState, Skeleton } from '../ui/index.jsx';
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

export function HomePage() {
  const { state } = useAuth(), unread = useUnread().count;
  return <section className="feed-page">
    <div className="feed-top">
      <div>
        <p className="eyebrow">A little ground. A good run.</p>
        <h1 className="feed-greeting">Good to see you,<br/><bdi>{state.user.displayName}</bdi>.</h1>
      </div>
      <div className="feed-top-actions">
        <Link className="home-bell" to="/notifications" aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}><Icon name="bell"/>{unread > 0 && <span className="tab-badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}</Link>
        <Link className="home-avatar" to="/you" aria-label="Open your profile"><Avatar id={state.user.avatarId || 0} color={state.user.avatarColor} size={40}/></Link>
      </div>
    </div>
    <Link className="outline-action map-entry" to="/map">Open territory map</Link>
    <div className="feed-heading"><h2>Your feed</h2></div>
    <Feed/>
  </section>;
}
