import {useCallback,useEffect,useState} from 'react';
import {useAuth} from '../auth/context.jsx';
import {Button,EmptyState,ErrorState,InlineNotice,Section,Skeleton} from '../ui/index.jsx';
import {useUnread} from './unread.jsx';

const when=iso=>new Date(iso).toLocaleString(undefined,{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
const dayKey=iso=>new Date(iso).toDateString();
function dayLabel(iso){const d=new Date(iso),t=new Date(),y=new Date(t.getTime()-864e5);return d.toDateString()===t.toDateString()?'Today':d.toDateString()===y.toDateString()?'Yesterday':d.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'short'});}
const message=e=>e?.code==='OFFLINE'||e?.name==='TypeError'?'You appear to be offline. Try again when you have signal.':'Notifications could not be loaded. Try again.';

export function NotificationsPage(){
  const {auth}=useAuth(),unread=useUnread(),[items,setItems]=useState([]),[cursor,setCursor]=useState(null),[phase,setPhase]=useState('loading'),[more,setMore]=useState(false),[error,setError]=useState('');
  const load=useCallback(async(next)=>{
    const first=!next;if(first)setPhase('loading');else setMore(true);setError('');
    try{
      const r=await auth.api.request(`/api/me/notifications?limit=20${next?`&cursor=${encodeURIComponent(next)}`:''}`);
      setItems(old=>first?r.notifications:[...old,...r.notifications.filter(n=>!old.some(o=>o.id===n.id))]);setCursor(r.nextCursor);unread.set(r.unreadCount);setPhase('ready');
    }catch(e){if(first)setPhase('error');setError(message(e));}finally{setMore(false);}
  },[auth]);
  useEffect(()=>{load(null);},[load]);
  async function read(n){
    if(n.read)return;
    setItems(old=>old.map(o=>o.id===n.id?{...o,read:true}:o));
    try{const r=await auth.api.request(`/api/me/notifications/${n.id}/read`,{method:'POST',body:{}});unread.set(r.unreadCount);}
    catch{setItems(old=>old.map(o=>o.id===n.id?{...o,read:false}:o));setError('Could not mark that as read.');}
  }
  async function readAll(){
    setError('');
    try{await auth.api.request('/api/me/notifications/read-all',{method:'POST',body:{}});setItems(old=>old.map(o=>({...o,read:true})));unread.set(0);}
    catch{setError('Could not mark everything as read.');}
  }
  const anyUnread=items.some(n=>!n.read);
  return <section className="notifications-page"><div className="page-head"><h1>Notifications</h1>{phase==='ready'&&anyUnread&&<Button variant="ghost" size="sm" onClick={readAll}>Mark all as read</Button>}</div>
    {phase==='loading'&&<Skeleton shape="row" lines={4} label="Loading notifications…"/>}
    {phase==='error'&&<ErrorState onRetry={()=>load(null)} label="Try again">{error}</ErrorState>}
    {phase==='ready'&&!items.length&&<EmptyState title="You’re all caught up">Run results, territory changes and badges appear here after your next run.</EmptyState>}
    {phase==='ready'&&items.length>0&&<>
      {items.reduce((groups,n)=>{const k=dayKey(n.createdAt),g=groups.at(-1);if(g&&g.k===k)g.rows.push(n);else groups.push({k,rows:[n]});return groups;},[]).map(g=><Section key={g.k} title={dayLabel(g.rows[0].createdAt)}><ul className="notice-list">{g.rows.map(n=><li key={n.id} className={`notice-item${n.read?'':' unread'}`}>
        <button type="button" onClick={()=>read(n)} aria-label={`${n.title}${n.read?'':', unread. Mark as read'}`}>
          <span className="notice-dot" aria-hidden="true"/><span className="notice-text"><strong>{n.title}</strong>{n.body&&<span>{n.body}</span>}<time dateTime={n.createdAt} className="small">{when(n.createdAt)}</time></span>
        </button></li>)}</ul></Section>)}
      {cursor&&<Button variant="secondary" block loading={more} onClick={()=>load(cursor)}>Load older</Button>}
      {error&&<InlineNotice error>{error}</InlineNotice>}</>}
  </section>;
}
