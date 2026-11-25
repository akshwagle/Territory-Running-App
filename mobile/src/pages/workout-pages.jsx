import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Icon, Sheet } from '../ui/index.jsx';

const SPORTS = [
  { key: 'run', label: 'Run', icon: 'run', copy: 'Record a road or trail run. Every cell you cross becomes ground you hold.' },
];

export function WorkoutPage() {
  const navigate = useNavigate(), [detail, setDetail] = useState(null);
  return <section className="workout-page">
    <h1>Workout</h1>
    <p className="page-lead">Record a run to claim the cells you cross.</p>
    {SPORTS.map(sport => <article className="sport-card" key={sport.key}>
      <div className="sport-head">
        <span className="sport-icon" aria-hidden="true"><Icon name={sport.icon}/></span>
        <h2>{sport.label}</h2>
        <button type="button" className="ui-icon-button sport-more" aria-label={`About ${sport.label.toLowerCase()} recording`} onClick={() => setDetail(sport)}><Icon name="chevron"/></button>
      </div>
      <Button onClick={() => navigate('/run')}><Icon name="play" width="18" height="18"/>Start</Button>
    </article>)}
    <button type="button" className="outline-action" onClick={() => navigate('/map')}>Territory map</button>
    <button type="button" className="outline-action" onClick={() => navigate('/stats')}>Stats, records and badges</button>
    <button type="button" className="outline-action" onClick={() => navigate('/run/history')}>Run history</button>
    <p className="workout-note">Recording needs location consent; you can change it any time in Profile → Privacy.</p>
    {detail && <Sheet title={`${detail.label} recording`} onClose={() => setDetail(null)}>
      <p>{detail.copy}</p>
      <p className="small">Runs record GPS on this phone and upload when finished. Cells you cross become your territory once the run is validated.</p>
      <div className="editor-actions"><Button onClick={() => setDetail(null)}>Close</Button></div>
    </Sheet>}
  </section>;
}
