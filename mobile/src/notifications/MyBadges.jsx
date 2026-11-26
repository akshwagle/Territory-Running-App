import {useCallback} from 'react';
import {useAuth} from '../auth/context.jsx';
import {useResource} from '../pages/use-resource.js';
import {Button,Section,Skeleton} from '../ui/index.jsx';

// Earned badges for the signed-in runner (other runners' badges are not shown).
export function MyBadges(){
  const {auth}=useAuth(),load=useCallback(()=>auth.api.request('/api/me/stats/achievements'),[auth]),data=useResource(load);
  const earned=Array.isArray(data.value?.badges)?data.value.badges.filter(b=>b.earned):null;
  return <Section plain title="Badges" className="profile-badges">
    {data.phase==='loading'&&!data.value?<Skeleton lines={1} label="Loading badges…"/>
      :!earned?<p className="small">Badges are unavailable right now. <Button variant="ghost" size="sm" onClick={data.reload}>Retry</Button></p>
        :earned.length?<ul className="badge-chips">{earned.map(b=><li key={b.id} title={b.description||undefined}>{b.name}</li>)}</ul>:<p className="small">No badges yet. Your first one comes with your first validated run.</p>}
    <Button variant="ghost" size="sm" to="/stats">See all badges and progress</Button>
  </Section>;
}
