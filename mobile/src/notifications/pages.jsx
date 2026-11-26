import {useCallback,useEffect,useState} from 'react';
import {useAuth} from '../auth/context.jsx';
import {Button,EmptyState,ErrorState,InlineNotice,Section,Skeleton} from '../ui/index.jsx';
import {useUnread} from './unread.jsx';

const when=iso=>new Date(iso).toLocaleString(undefined,{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
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
  return <section className="notifications-page"><p className="eyebrow">Activity</p><h1>Notifications</h1>
    {phase==='loading'&&<Skeleton label="Loading notifications…"/>}
    {phase==='error'&&<ErrorState onRetry={()=>load(null)} label="Try again">{error}</ErrorState>}
    {phase==='ready'&&!items.length&&<EmptyState title="You’re all caught up">Run results, territory changes and badges will appear here after your next run.</EmptyState>}
    {phase==='ready'&&items.length>0&&<>
      {anyUnread&&<Button variant="secondary" onClick={readAll}>Mark all as read</Button>}
      <Section><ul className="notice-list">{items.map(n=><li key={n.id} className={`notice-item${n.read?'':' unread'}`}>
        <button type="button" onClick={()=>read(n)} aria-label={`${n.title}${n.read?'':', unread. Mark as read'}`}>
          <span className="notice-dot" aria-hidden="true"/><span className="notice-text"><strong>{n.title}</strong>{n.body&&<span>{n.body}</span>}<time dateTime={n.createdAt} className="small">{when(n.createdAt)}</time></span>
        </button></li>)}</ul></Section>
      {cursor&&<Button variant="secondary" loading={more} onClick={()=>load(cursor)}>Load older</Button>}
      {error&&<InlineNotice error>{error}</InlineNotice>}</>}
  </section>;
}
