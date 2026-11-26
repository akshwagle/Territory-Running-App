import {useCallback} from 'react';
import {Link} from 'react-router';
import {useAuth} from '../auth/context.jsx';
import {useResource} from '../pages/use-resource.js';

// Earned badges for the signed-in runner (other runners' badges are not shown).
export function MyBadges(){
  const {auth}=useAuth(),load=useCallback(()=>auth.api.request('/api/me/stats/achievements'),[auth]),data=useResource(load);
  if(data.phase==='loading'&&!data.value)return <p className="small" role="status">Loading badges…</p>;
  if(!Array.isArray(data.value?.badges))return <p className="small">Badges are unavailable right now. <button type="button" className="secondary" onClick={data.reload}>Retry</button></p>;
  const earned=data.value.badges.filter(b=>b.earned);
  return <section className="profile-badges" aria-label="Badges"><h2>Badges</h2>
    {earned.length?<ul className="badge-chips">{earned.map(b=><li key={b.id} title={b.description||undefined}>{b.name}</li>)}</ul>:<p className="small">No badges yet. Keep running to earn your first.</p>}
    <p className="small"><Link to="/stats">See all badges and progress</Link></p></section>;
}
