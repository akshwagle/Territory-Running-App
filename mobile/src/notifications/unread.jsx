import {useLocation} from 'react-router';
import {createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';

const POLL_MS=60000;
const UnreadContext=createContext({count:0,refresh:()=>{},set:()=>{}});
export const useUnread=()=>useContext(UnreadContext);
// Unread count for the tab bar badge. Polls only while a runner is signed in and
// the app is visible; failures keep the last known number (offline-safe).
export function UnreadProvider({api,userId,children}){
  const [count,setCount]=useState(0),{pathname}=useLocation();
  const refresh=useCallback(async()=>{
    if(!userId)return;
    try{const r=await api.request('/api/me/notifications/unread-count');if(Number.isInteger(r?.unreadCount))setCount(r.unreadCount);}catch{/* keep last value */}
  },[api,userId]);
  useEffect(()=>{
    setCount(0);if(!userId)return undefined;
    refresh();
    const tick=()=>{if(document.visibilityState!=='hidden')refresh();};
    const timer=setInterval(tick,POLL_MS);document.addEventListener('visibilitychange',tick);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick);};
  },[userId,refresh]);
  // A run finished or a tab change may have produced new notifications.
  useEffect(()=>{refresh();},[pathname,refresh]);
  const value=useMemo(()=>({count,refresh,set:setCount}),[count,refresh]);
  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}
