import { useState } from 'react';
import { Button, Chip, Icon, Section, useToast } from '../ui/index.jsx';

const SECTIONS = ['Challenges', 'Clubs', 'Events'];
const SPORTS = [{ key: 'run', label: 'Run', icon: 'run' }, { key: 'ride', label: 'Ride', icon: 'ride' }];

function Challenges() {
  const show = useToast(), [sport, setSport] = useState('run');
  return <div className="community-section">
    <div className="sport-chips" role="group" aria-label="Challenge sport">
      {SPORTS.map(row => <Chip key={row.key} selected={sport === row.key} onClick={() => setSport(row.key)}><Icon name={row.icon} width="18" height="18"/>{row.label}</Chip>)}
    </div>
    <article className="challenge-card">
      <div className="challenge-art" aria-hidden="true"><span>NOV</span><Icon name="trophy" width="34" height="34"/></div>
      <span className="sample-tag">Sample</span>
      <h2>November climb</h2>
      <p>{sport === 'ride' ? 'Climb 2,000 m by bike in November.' : 'Climb 2,000 m on foot in November.'}</p>
      <p className="challenge-dates">1–30 November</p>
      <Button onClick={() => show?.('Challenges open when run recording ships.')}>Join challenge</Button>
    </article>
    <article className="promo-card">
      <span className="promo-icon" aria-hidden="true"><Icon name="users"/></span>
      <h2>Group challenges</h2>
      <p>Start a custom challenge with your friends and chase it together.</p>
      <button type="button" className="outline-action" onClick={() => show?.('Group challenges arrive with the community build.')}>Create a group challenge</button>
    </article>
  </div>;
}

function Clubs() {
  const show = useToast();
  return <div className="community-section">
    <article className="promo-card">
      <span className="promo-icon" aria-hidden="true"><Icon name="users"/></span>
      <h2>Create your own club</h2>
      <p>Give your community a home base: shared goals, meet-ups and a place to plan runs.</p>
      <Button onClick={() => show?.('Club creation arrives with the community build.')}>Get started</Button>
    </article>
    <Section title="Your clubs"><p className="small">You are not in a club yet. Clubs you join appear here.</p></Section>
  </div>;
}

function Events() {
  return <div className="community-section">
    <div className="feed-heading"><h2>Local club events</h2><span className="small">Sample</span></div>
    <article className="event-card">
      <div className="event-date" aria-hidden="true"><span>NOV</span><b>20</b><span>FRI</span></div>
      <div className="event-body">
        <strong>Sunrise 5K</strong>
        <span><Icon name="run" width="14" height="14"/>Running · Riverside Trail</span>
        <span>Hosted by Pine Pacers · 103 members</span>
      </div>
    </article>
    <p className="feed-note">Sample listing. Club events appear here once clubs open.</p>
    <div className="feed-heading"><h2>Races</h2></div>
    <p className="small">No races are listed yet. Race entries will appear here when events launch.</p>
  </div>;
}

export function CommunityPage() {
  const [section, setSection] = useState('Challenges');
  return <section className="community-page">
    <h1>Community</h1>
    <div className="segmented" role="group" aria-label="Community sections">
      {SECTIONS.map(name => <button key={name} type="button" aria-pressed={section === name} onClick={() => setSection(name)}>{name}</button>)}
    </div>
    {section === 'Challenges' && <Challenges/>}
    {section === 'Clubs' && <Clubs/>}
    {section === 'Events' && <Events/>}
  </section>;
}
