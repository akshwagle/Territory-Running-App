import Reveal from './Reveal.jsx';

const questions = [
  ['Is it free?', 'Yes. The current early Android build is free to download.'],
  ['Is it on the Play Store?', 'No. For now, the Android APK is available directly from this website. There is no iPhone version yet.'],
  ['Why does Android warn me?', 'Android treats installs outside the Play Store differently. Play Protect may warn about an unfamiliar app. Read the warning and decide whether you trust the source before continuing.'],
  ['What permissions does it need?', 'INTERNET is the only Android platform permission for now. Location will be requested when run tracking arrives. The current build does not record runs or access your location.'],
];

export default function FAQ() {
  return <section id="faq" className="section container grid-12 faq-section" aria-labelledby="faq-title"><div className="section-intro"><p className="eyebrow">04 &nbsp; A FEW QUESTIONS</p><h2 id="faq-title">INSTALLATION<br />QUESTIONS.</h2><svg className="hex-divider" viewBox="0 0 200 38" aria-hidden="true"><path d="M0 19h79m42 0h79" stroke="var(--color-line)" /><polygon points="100,1 116,10 116,28 100,37 84,28 84,10" fill="none" stroke="var(--color-line)" /></svg></div><Reveal className="faq-list">{questions.map(([question, answer]) => <details key={question} id={question === 'Why does Android warn me?' ? 'android-warning' : undefined}><summary>{question}<span className="faq-indicator" aria-hidden="true" /></summary><p>{answer}</p></details>)}</Reveal></section>;
}
