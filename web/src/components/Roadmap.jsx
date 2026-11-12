import Reveal from './Reveal.jsx';

const roadmap = ['Run tracking', 'Territory claiming', 'Leaderboards', 'Teams', 'Seasons'];

export default function Roadmap() {
  return <section className="roadmap-band" aria-labelledby="roadmap-title"><div className="section container grid-12">
        <div className="section-intro"><p className="eyebrow">02 &nbsp; WHAT’S BEING BUILT</p><h2 id="roadmap-title">IN<br />DEVELOPMENT.</h2><p>Only the Android download is available today. Run tracking and territory features are in development.</p><p className="early-note"><strong>Early build.</strong> The app currently shows connection status. It cannot record runs yet.</p></div>
        <Reveal className="roadmap-list"><ul>{roadmap.map((feature) => <li key={feature}><span>{feature}</span><span className="development-label">In development</span></li>)}</ul></Reveal>
      </div></section>;
}
