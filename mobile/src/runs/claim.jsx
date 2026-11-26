import {useCallback} from 'react';
import {useAuth} from '../auth/context.jsx';
import {useResource} from '../pages/settings-pages.jsx';
import {ErrorState,InlineNotice,Skeleton,StatGrid,StatTile} from '../ui/index.jsx';
import {claimTiles,flagText,verdictText} from './format.js';

// Server-validated territory outcome for one finished run. Counts come from
// GET /api/runs/:id/claim, which derives them from run_hexes/hex_ownership.
export function ClaimResult({runId}){
 const {auth}=useAuth(),load=useCallback(()=>auth.api.request(`/api/runs/${runId}/claim`),[auth,runId]),data=useResource(load),result=data.value;
 if(data.phase==='loading'&&!result)return <Skeleton label="Checking your territory…"/>;
 if(data.phase==='error'&&!result)return <ErrorState onRetry={data.reload}>{data.error}</ErrorState>;
 if(!result)return null;
 const claimed=result.status==='VALID';
 return <section className="claim-result" aria-label="Territory result">
  <h2>{verdictText(result)}</h2>
  {claimed&&<StatGrid className="claim-grid">{claimTiles(result.claim).map(tile=><StatTile key={tile.key} className={`claim-tile claim-tile--${tile.key}`} tone={tile.key==='lost'?'danger':tile.key==='claimed'||tile.key==='held'?'accent':undefined} label={tile.label} value={tile.value}/>)}</StatGrid>}
  {claimed&&result.claim.onCooldown>0&&<p className="small">{result.claim.onCooldown} cells belong to a runner whose cooldown has not ended.</p>}
  {claimed&&result.claim.restricted>0&&<p className="small">{result.claim.restricted} cells were in areas where claiming is not allowed.</p>}
  {claimed&&result.badges?.length>0&&<div className="run-badges"><h3>Badge earned</h3><ul className="badge-chips">{result.badges.map(b=>(<li key={b.code} title={b.description||undefined}>{b.name}</li>))}</ul></div>}
  {!claimed&&flagText(result)&&<InlineNotice>{flagText(result)}</InlineNotice>}
 </section>;
}
