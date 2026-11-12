import Reveal from './Reveal.jsx';
import ReleaseCard from './ReleaseCard.jsx';
import PhoneIllustration from './PhoneIllustration.jsx';

const installSteps = [
  ['Download', 'Save the APK from this page to your Android phone.'],
  ['Allow this source', 'If Android asks, allow installs from the browser or file manager you used. You can turn this off afterwards.'],
  ['Install', 'Open the downloaded file and follow Android’s install prompts.'],
  ['Open', 'Launch Territory Run. The current build shows connection status; run tracking is not available yet.'],
];

export default function InstallGuide({ control, sectionRef }) {
  return <section id="install" className="install-band" ref={sectionRef} aria-labelledby="install-title"><div className="section container grid-12">
        <div className="install-intro"><p className="eyebrow">03 &nbsp; INSTALL ON ANDROID</p><h2 id="install-title">INSTALL THE<br />ANDROID APK.</h2><p>A direct APK download, for Android 7.0 and newer.<br className="desktop-break" /> Follow these steps to install the download.</p></div>
        <Reveal className="install-steps"><ol>{installSteps.map(([title, copy], i) => <li key={title}><span className="install-number" aria-hidden="true">0{i + 1}</span><div><h3>{title}</h3><p>{copy}</p></div></li>)}</ol><div className="play-protect"><h3>A NOTE ON PLAY PROTECT</h3><p>Play Protect may warn because this app is installed outside the Play Store. Review the warning before deciding whether to continue. </p></div><p className="install-trouble">Having trouble? <a href="#android-warning" onClick={() => document.getElementById('android-warning')?.setAttribute('open', '')}>Read about the Android warning</a>.</p></Reveal>
        <Reveal className="install-phone"><PhoneIllustration /></Reveal>
        <Reveal className="release-wrap"><ReleaseCard {...control} /></Reveal>

      </div></section>;
}
