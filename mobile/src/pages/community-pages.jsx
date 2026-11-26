import { useCallback, useState } from 'react';
import { useAuth } from '../auth/context.jsx';
import { Avatar, Button, Card, Chip, Segmented, EmptyState, ErrorState, Icon, Section, Skeleton, TextField, useToast } from '../ui/index.jsx';
import { distanceLabel } from '../runs/format.js';
import { useResource } from './use-resource.js';

const SECTIONS = ['Leaderboard', 'Teams', 'Runners'];
const METRICS = [
  { key: 'hexes', label: 'Hexes held' }, { key: 'distance', label: 'Distance' }, { key: 'runs', label: 'Runs' },
];
const PERIODS = [{ key: 'week', label: 'Week' }, { key: 'month', label: 'Month' }, { key: 'season', label: 'Season' }];
const SCOPES = [{ key: 'global', label: 'Everyone' }, { key: 'following', label: 'Following' }, { key: 'team', label: 'My team' }];
const COLORS = ['#1F5A46', '#B8452A', '#14392C', '#4F6480', '#6F86A6', '#A8812A'];

const valueText = (metric, value) => metric === 'distance' ? distanceLabel(value) : String(value);
const errText = error => error?.message || 'That didn’t go through. Check your connection and try again.';

export function Person({ person, children, sub, mine = false }) {
  return <li className={`person-row${mine ? ' is-me' : ''}`} aria-current={mine ? 'true' : undefined}>
    <Avatar id={person.avatarId || 0} color={person.avatarColor} size={40}/>
    <div className="person-name"><strong dir="auto">{person.displayName}</strong>{sub && <span className="small">{sub}</span>}</div>
    {children}
  </li>;
}

export function FollowButton({ person, onChange }) {
  const { auth } = useAuth(), show = useToast(), [busy, setBusy] = useState(false), [following, setFollowing] = useState(!!person.following);
  if (!person.id) return null;
  const toggle = async () => {
    setBusy(true);
    try {
      await auth.api.request(`/api/users/${person.id}/follow`, { method: following ? 'DELETE' : 'PUT' });
      setFollowing(!following); onChange?.(!following);
    } catch (error) { show?.(errText(error)); } finally { setBusy(false); }
  };
  return <Button variant={following ? 'ghost' : 'secondary'} size="sm" loading={busy} onClick={toggle} aria-pressed={following}
    aria-label={`${following ? 'Unfollow' : 'Follow'} ${person.displayName}`} className="follow-btn">{following ? 'Following' : 'Follow'}</Button>;
}

function Leaderboard() {
  const { auth } = useAuth();
  const [metric, setMetric] = useState('hexes'), [period, setPeriod] = useState('week'), [scope, setScope] = useState('global');
  const load = useCallback(() => auth.api.request(`/api/community/leaderboard?metric=${metric}&period=${period}&scope=${scope}&limit=25`), [auth, metric, period, scope]);
  const data = useResource(load), v = data.value;
  return <div className="community-section">
    <div className="filter-stack"><div className="chip-row" role="group" aria-label="Metric">{METRICS.map(m => <Chip key={m.key} selected={metric === m.key} onClick={() => setMetric(m.key)}>{m.label}</Chip>)}</div>
    {metric !== 'hexes' && <div className="chip-row" role="group" aria-label="Period">{PERIODS.map(m => <Chip key={m.key} selected={period === m.key} onClick={() => setPeriod(m.key)}>{m.label}</Chip>)}</div>}
    <div className="chip-row" role="group" aria-label="Who">{SCOPES.map(m => <Chip key={m.key} selected={scope === m.key} onClick={() => setScope(m.key)}>{m.label}</Chip>)}</div></div>
    {data.phase === 'loading' && !v && <Skeleton shape="row" lines={5} label="Loading leaderboard…"/>}
    {data.phase === 'error' && (scope === 'team' && /team/i.test(data.error) ? <EmptyState title="No team yet">Join or create a team in the Teams tab to see your team’s ranking.</EmptyState>
      : <ErrorState onRetry={data.reload}>{data.error}</ErrorState>)}
    {v && data.phase !== 'error' && <>
      {v.season && v.period === 'season' && <p className="small">{v.season.name}: {v.season.daysLeft} {v.season.daysLeft === 1 ? 'day' : 'days'} left</p>}
      {!v.optedIn && <p className="feed-note">You are hidden from leaderboards. Turn on “Appear on leaderboards” in Privacy to be ranked.</p>}
      {v.entries.length === 0 ? <EmptyState title="The board is open">{v.period === 'season' && !v.season ? 'No season is running right now.' : 'Finish a valid run to take the first spot.'}</EmptyState>
        : <Section><ol className="board-list">{v.entries.map(e => <Person key={`${e.rank}-${e.id || e.displayName}-${e.value}`} person={e} mine={!!e.isMe} sub={e.isMe ? 'You' : null}>
          <span className="board-rank" aria-label={`Rank ${e.rank}`}>#{e.rank}</span><b>{valueText(v.metric, e.value)}</b></Person>)}</ol></Section>}
      {v.me && <div className="you-row" role="status"><Icon name="trophy" aria-hidden="true"/><span>{`Your rank: #${v.me.rank} · ${valueText(v.metric, v.me.value)}`}</span></div>}
    </>}
  </div>;
}

function TeamCreate({ onDone }) {
  const { auth } = useAuth(), [name, setName] = useState(''), [color, setColor] = useState(COLORS[0]), [code, setCode] = useState(''), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const submit = async (kind, path, body) => {
    setBusy(kind); setError('');
    try { await auth.api.request(path, { method: 'POST', body }); onDone(); } catch (e) { setError(errText(e)); } finally { setBusy(''); }
  };
  return <div className="community-section">
    <EmptyState title="Run with a team">Join a team with an invite code, or start your own. Teams hold up to 50 runners.</EmptyState>
    <Section title="Join a team">
      <TextField label="Invite code" value={code} onChange={e => setCode(e.target.value)} autoCapitalize="characters" maxLength={12}/>
      <Button loading={busy === 'join'} disabled={code.trim().length < 6} onClick={() => submit('join', '/api/teams/join', { inviteCode: code })}>Join team</Button>
    </Section>
    <Section title="Start a team">
      <TextField label="Team name" value={name} onChange={e => setName(e.target.value)} maxLength={50}/>
      <div className="chip-row" role="group" aria-label="Team colour">{COLORS.map(c => <Chip key={c} selected={color === c} onClick={() => setColor(c)} aria-label={`Colour ${c}`}><span className="swatch" style={{ background: c }}/></Chip>)}</div>
      <Button loading={busy === 'create'} disabled={name.trim().length < 3} onClick={() => submit('create', '/api/teams', { name, colorHex: color })}>Create team</Button>
    </Section>
    {error && <p role="alert" className="form-error">{error}</p>}
  </div>;
}

function TeamView({ team, onChange }) {
  const { auth } = useAuth(), show = useToast(), [busy, setBusy] = useState('');
  const load = useCallback(() => auth.api.request('/api/teams/me/members'), [auth]);
  const members = useResource(load);
  const act = async (key, path, opts) => {
    setBusy(key);
    try { await auth.api.request(path, opts); if (key === 'leave') onChange(); else members.reload(); } catch (e) { show?.(errText(e)); } finally { setBusy(''); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(team.inviteCode); show?.('Invite code copied.'); } catch { show?.(`Invite code: ${team.inviteCode}`); } };
  return <div className="community-section">
    <Card className="team-card" style={{ '--team': team.colorHex }}><h2 dir="auto">{team.name}</h2>
      <p>{team.memberCount} of {team.maxMembers} runners · you are {team.role === 'CAPTAIN' ? 'captain' : 'a member'}</p>
      <p className="team-code"><span className="small">Invite code</span><b className="invite-code">{team.inviteCode}</b></p>
      <Button variant="secondary" block onClick={copy}><Icon name="share" width="16" height="16"/>Copy invite code</Button></Card>
    <Section title="Members">
      {members.phase === 'loading' && !members.value && <Skeleton shape="row" label="Loading members…"/>}
      {members.phase === 'error' && <ErrorState onRetry={members.reload}>{members.error}</ErrorState>}
      {members.value && <ul className="person-list">{members.value.members.map(m => <Person key={m.id || m.displayName + m.joinedAt} person={m}
        sub={`${m.role === 'CAPTAIN' ? 'Captain' : 'Member'}${m.hexes != null ? ` · ${m.hexes} hexes` : ''}`}>
        {team.role === 'CAPTAIN' && !m.isMe && m.id && <Button variant="secondary" size="sm" loading={busy === m.id} aria-label={`Remove ${m.displayName}`}
          onClick={() => act(m.id, `/api/teams/me/members/${m.id}`, { method: 'DELETE' })}>Remove</Button>}</Person>)}</ul>}
    </Section>
    <Button variant="destructive" block loading={busy === 'leave'} onClick={() => act('leave', '/api/teams/leave', { method: 'POST', body: {} })}>Leave team</Button>
  </div>;
}

function TeamBoard() {
  const { auth } = useAuth(), load = useCallback(() => auth.api.request('/api/community/team-leaderboard'), [auth]), data = useResource(load);
  if (data.phase === 'loading' && !data.value) return <Skeleton label="Loading team ranking…"/>;
  if (data.phase === 'error') return <ErrorState onRetry={data.reload}>{data.error}</ErrorState>;
  const teams = data.value?.teams || [];
  return <Section title="Team ranking">{teams.length === 0 ? <p className="small">No teams are ranked yet. A team appears once its ranked members hold territory.</p>
    : <ol className="board-list">{teams.map(t => <li key={t.id} className="person-row"><span className="board-rank">#{t.rank}</span>
      <div className="person-name"><strong dir="auto" className="team-name" style={{ '--team': t.colorHex }}>{t.name}</strong><span className="small">{t.members} runners{t.isMine ? ' · your team' : ''}</span></div>
      <b>{t.hexes} hexes</b></li>)}</ol>}</Section>;
}

function Teams() {
  const { auth } = useAuth(), load = useCallback(() => auth.api.request('/api/teams/me'), [auth]), mine = useResource(load);
  return <>
    {mine.phase === 'loading' && !mine.value && <Skeleton label="Loading your team…"/>}
    {mine.phase === 'error' && <ErrorState onRetry={mine.reload}>{mine.error}</ErrorState>}
    {mine.value && (mine.value.team ? <TeamView team={mine.value.team} onChange={mine.reload}/> : <TeamCreate onDone={mine.reload}/>)}
    {mine.value && <TeamBoard key={mine.value.team?.id || 'none'}/>}
  </>;
}

function Runners() {
  const { auth } = useAuth(), [which, setWhich] = useState('following'), [q, setQ] = useState(''), [results, setResults] = useState(null), [searchError, setSearchError] = useState('');
  const load = useCallback(() => auth.api.request(`/api/me/${which}?limit=50`), [auth, which]), data = useResource(load);
  const search = async event => {
    event.preventDefault(); setSearchError('');
    try { setResults((await auth.api.request(`/api/community/search?q=${encodeURIComponent(q.trim())}`)).users); } catch (e) { setSearchError(errText(e)); }
  };
  return <div className="community-section">
    <form onSubmit={search} role="search"><TextField label="Find runners by name" value={q} onChange={e => setQ(e.target.value)} maxLength={30}/>
      <Button type="submit" block disabled={q.trim().length < 2} reason={q.trim().length < 2 ? 'Type at least 2 letters.' : undefined}>Search</Button></form>
    {searchError && <p role="alert" className="form-error">{searchError}</p>}
    {results && (results.length === 0 ? <p className="small">No runners match that name. Private profiles are not listed.</p>
      : <Section title="Results"><ul className="person-list" aria-label="Search results">{results.map(p => <Person key={p.id} person={p}><FollowButton person={p} onChange={data.reload}/></Person>)}</ul></Section>)}
    <div className="chip-row" role="group" aria-label="List">{['following', 'followers'].map(k => <Chip key={k} selected={which === k} onClick={() => setWhich(k)}>{k === 'following' ? 'Following' : 'Followers'}</Chip>)}</div>
    {data.phase === 'loading' && !data.value && <Skeleton shape="row" label="Loading runners…"/>}
    {data.phase === 'error' && <ErrorState onRetry={data.reload}>{data.error}</ErrorState>}
    {data.value && (data.value.users.length === 0 ? <EmptyState title={which === 'following' ? 'Not following anyone' : 'No followers yet'}>{which === 'following' ? 'Search for a runner above and follow them to see their runs on Home.' : 'Runners who follow you appear here.'}</EmptyState>
      : <Section><ul className="person-list" key={which}>{data.value.users.map(p => <Person key={p.id || p.displayName + p.since} person={p}>{p.id && <FollowButton person={p} onChange={data.reload}/>}</Person>)}</ul></Section>)}
  </div>;
}

export function CommunityPage() {
  const [section, setSection] = useState('Leaderboard');
  return <section className="community-page">
    <h1>Community</h1>
    <Segmented label="Community sections" options={SECTIONS} value={section} onChange={setSection}/>
    {section === 'Leaderboard' && <Leaderboard/>}
    {section === 'Teams' && <Teams/>}
    {section === 'Runners' && <Runners/>}
  </section>;
}
