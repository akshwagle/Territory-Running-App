import { useState } from 'react';
import { Button, Card, Icon, ListRow, Section, Sheet } from '../ui/index.jsx';

// Workout tab: one hero (start a run) and the places a runner goes next.
export function WorkoutPage() {
  const [about, setAbout] = useState(false);
  return <section className="workout-page">
    <h1>Workout</h1>
    <Card className="workout-start" aria-labelledby="workout-run-title">
      <div className="workout-start-head">
        <span className="workout-start-icon" aria-hidden="true"><Icon name="run"/></span>
        <h2 id="workout-run-title">Run</h2>
      </div>
      <p>Record a road or trail run. Every area you cross can become your territory.</p>
      <Button to="/run" block><Icon name="play" width="18" height="18"/>Start run</Button>
      <button type="button" className="text-link" onClick={() => setAbout(true)}>How recording works</button>
    </Card>
    <Section title="Your running">
      <ListRow to="/map" icon="layers" label="Territory map" subtitle="See what you hold and what is close"/>
      <ListRow to="/stats" icon="chart" label="Stats and badges" subtitle="Records, streaks and progress"/>
      <ListRow to="/run/history" icon="calendar" label="Run history"/>
    </Section>
    <p className="small workout-note">Recording needs location consent. You can change it any time in Privacy on the You tab.</p>
    {about && <Sheet title="How recording works" onClose={() => setAbout(false)}>
      <p>Your phone records GPS while you run and keeps the points encrypted until the run uploads. Pausing and finishing work offline.</p>
      <p className="small">Areas you cross become your territory once the run is validated. Indoor and treadmill runs record time only.</p>
      <div className="editor-actions"><Button onClick={() => setAbout(false)}>Got it</Button></div>
    </Sheet>}
  </section>;
}
