import {createContext,useContext,useSyncExternalStore} from 'react';
export const RunContext=createContext(null);
export function useRecorder(){const recorder=useContext(RunContext);if(!recorder)throw Error('Recorder provider missing.');const state=useSyncExternalStore(recorder.subscribe,recorder.getSnapshot);return {recorder,state};}
