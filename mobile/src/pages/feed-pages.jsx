import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/context.jsx';
import { Avatar, Button, Icon, useToast } from '../ui/index.jsx';

/* Illustrative posts until run recording and the community feed ship. They are
   labelled as samples in the UI and never mixed with real account data. */
const SAMPLE_ACTIVITIES = [
  {
    id: 'sample-tempo', name: 'Mira Kulkarni', avatarId: 2, avatarColor: '#1F5A46',
    when: 'Today at 6:56 AM', place: 'Riverside loop', title: 'Tempo run',
    note: 'Warm up 1 km → 2 km tempo → 900 m cool-down.',
    distance: '5.71 km', pace: '5:47 /km', time: '33m 0s', kudos: 2,
  },
  {
    id: 'sample-evening', name: 'Dev Sharma', avatarId: 5, avatarColor: '#B8452A',
    when: 'Yesterday at 6:09 PM', place: 'Canal path', title: 'Evening run',
    note: 'Easy miles after class. Legs felt light.',
    distance: '5.19 km', pace: '6:21 /km', time: '33m 3s', kudos: 1,
  },
  {
    id: 'sample-ride', name: 'Aarav Nair', avatarId: 8, avatarColor: '#14392C',
    when: 'Yesterday at 7:42 AM', place: 'Hill circuit', title: 'Morning ride',
    note: 'Two climbs, one coffee stop.',
    distance: '24.6 km', pace: '21.4 km/h', time: '1h 09m', kudos: 4,
  },
];

function GoalCard() {
  const show = useToast();
  return <article className="goal-card" aria-labelledby="goal-title">
    <div className="goal-head">
      <span className="goal-badge" aria-hidden="true"><Icon name="target"/></span>
      <div>
        <p className="goal-kicker">Suggested goal</p>
        <h2 id="goal-title">20 km per week</h2>
        <p className="goal-progress">0 km of 20 km · resets Monday</p>
      </div>
    </div>
    <div className="goal-bar" aria-hidden="true"><span/></div>
    <Button onClick={() => show?.('Weekly goals unlock when run recording ships.')}>Set goal</Button>
  </article>;
}

function ActivityCard({ post }) {
  const show = useToast(), [liked, setLiked] = useState(false);
  const kudos = post.kudos + (liked ? 1 : 0);
  return <article className="feed-post">
    <header className="feed-post-head">
      <Avatar id={post.avatarId} color={post.avatarColor} size={44}/>
      <div className="feed-post-who">
        <strong dir="auto">{post.name}</strong>
        <span>{post.when} · Territory Run</span>
        <span className="feed-post-place"><Icon name="target" width="13" height="13"/>{post.place}</span>
      </div>
      <span className="sample-tag">Sample</span>
    </header>
    <h3>{post.title}</h3>
    <p className="feed-post-note" dir="auto">{post.note}</p>
    <dl className="feed-stats">
      <div><dt>Distance</dt><dd>{post.distance}</dd></div>
      <div><dt>Pace</dt><dd>{post.pace}</dd></div>
      <div><dt>Time</dt><dd>{post.time}</dd></div>
    </dl>
    <p className="feed-kudos">{kudos ? `${kudos} gave kudos` : 'No kudos yet'}</p>
    <div className="feed-actions">
      <button type="button" aria-label="Give kudos" aria-pressed={liked} onClick={() => setLiked(value => !value)}><Icon name="heart"/></button>
      <button type="button" aria-label="Comment on this activity" onClick={() => show?.('Comments arrive with the community build.')}><Icon name="comment"/></button>
      <button type="button" aria-label="Share this activity" onClick={() => show?.('Sharing activities arrives with the community build.')}><Icon name="share"/></button>
    </div>
  </article>;
}

export function HomePage() {
  const { state } = useAuth();
  return <section className="feed-page">
    <div className="feed-top">
      <div>
        <p className="eyebrow">A little ground. A good run.</p>
        <h1 className="feed-greeting">Good to see you,<br/><bdi>{state.user.displayName}</bdi>.</h1>
      </div>
      <Link className="home-avatar" to="/you" aria-label="Open your profile"><Avatar id={state.user.avatarId || 0} color={state.user.avatarColor} size={40}/></Link>
    </div>
    <GoalCard/>
    <div className="feed-heading">
      <h2>Your feed</h2><span className="small">Sample activities</span>
    </div>
    <p className="feed-note">The live feed of your friends’ runs arrives with run recording. Until then these examples show the layout.</p>
    {SAMPLE_ACTIVITIES.map(post => <ActivityCard key={post.id} post={post}/>)}
  </section>;
}
