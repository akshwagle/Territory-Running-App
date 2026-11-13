import { DISCARD_CONFIRMATION } from '../auth/pending-work.js';
import { ApiError } from '../auth/errors.js';

export function createConsentControls(auth) {
  return {
    async withdraw(location) {
      // Stop immediately, even offline. Earlier points remain encrypted until
      // the user explicitly chooses upload or discard. Retry the server write.
      await auth.pending.stopRecording(auth.getSnapshot().user.id,'consent-withdrawn');
      return auth.api.request('/api/me/consents',{method:'POST',body:{type:'LOCATION',version:location.version,accepted:false}});
    },
    uploadEarlier:()=>auth.pending.upload(auth.getSnapshot().user.id),
    discardEarlier:confirmation=>auth.pending.discard(auth.getSnapshot().user.id,confirmation),
  };
}

// Step 05 must call this before its first point and whenever policy changes.
export function recordingDecision(consents,permission) {
  if(!consents?.length||!['LOCATION','TERMS','PRIVACY'].every(type=>consents.some(c=>c.type===type&&c.accepted&&!c.requiresAcceptance)))
    return {allowed:false,reason:'CONSENT_REQUIRED',message:'Read and accept the current location, terms and privacy notices before recording.'};
  if(permission!=='precise')return {allowed:false,reason:'PRECISE_LOCATION_REQUIRED',message:'Recording needs precise location to validate your route and claim territory. In Android’s location prompt, choose Precise. Approximate location cannot be used for a run.'};
  return {allowed:true};
}
export async function discardSaved(controls,confirmation) {
  if(confirmation!==DISCARD_CONFIRMATION)throw new ApiError('CONFIRM_DISCARD','Confirm again before discarding saved points.');
  await controls.discardEarlier(confirmation);
}
