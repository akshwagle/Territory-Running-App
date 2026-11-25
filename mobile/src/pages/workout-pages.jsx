import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Icon, Sheet, useToast } from '../ui/index.jsx';

const SPORTS = [
  { key: 'run', label: 'Run', icon: 'run', copy: 'Record a road or trail run. Every cell you cross becomes ground you hold.' },
  { key: 'ride', label: 'Ride', icon: 'ride', copy: 'Log a ride and claim the streets, paths and hills you cover.' },
];

export function WorkoutPage() {
  const show = useToast(), navigate = useNavigate(), [detail, setDetail] = useState(null);
  return <section className="workout-page">
    <h1>Workout</h1>
    <p className="page-lead">Choose a sport to start. Run recording and territory claiming are live; ride recording arrives in a later build.</p>
    {SPORTS.map(sport => <article className="sport-card" key={sport.key}>
      <div className="sport-head">
        <span className="sport-icon" aria-hidden="true"><Icon name={sport.icon}/></span>
        <h2>{sport.label}</h2>
        <button type="button" className="ui-icon-button sport-more" aria-label={`About ${sport.label.toLowerCase()} recording`} onClick={() => setDetail(sport)}><Icon name="chevron"/></button>
      </div>
      <Button onClick={() => sport.key === 'run' ? navigate('/run') : show?.(`${sport.label} recording starts in the next build.`)}><Icon name="play" width="18" height="18"/>Start</Button>
    </article>)}
    <button type="button" className="outline-action" onClick={() => navigate('/map')}>Territory map</button>
    <button type="button" className="outline-action" onClick={() => navigate('/run/history')}>Run history</button>
    <button type="button" className="outline-action" onClick={() => show?.('Run and ride are the only sports for now.')}>More sports</button>
    <p className="workout-note">Recording needs location consent; you can change it any time in Profile → Privacy.</p>
    {detail && <Sheet title={`${detail.label} recording`} onClose={() => setDetail(null)}>
      <p>{detail.copy}</p>
      <p className="small">{detail.key === 'run' ? 'Runs record GPS on this phone and upload when finished. Cells you cross become your territory once the run is validated.' : 'Ride recording is not available yet.'}</p>
      <div className="editor-actions"><Button onClick={() => setDetail(null)}>Close</Button></div>
    </Sheet>}
  </section>;
}
