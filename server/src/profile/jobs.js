'use strict';

// Future recording/claim workers register an AbortController here and acquire
// lockAccountWork before publishing. Deletion cancels only after its commit.
function createAccountJobs(logger=()=>{}) {
  const work=new Map();
  function enqueue(userId,task) {
    const controller=new AbortController();
    const entry={controller,promise:null};
    if(!work.has(userId))work.set(userId,new Set());
    work.get(userId).add(entry);
    entry.promise=Promise.resolve().then(()=>task(controller.signal)).catch(()=>{
      logger(JSON.stringify({event:'account_job_failed'}));
    }).finally(()=>{const entries=work.get(userId);entries?.delete(entry);if(!entries?.size)work.delete(userId);});
    return entry.promise;
  }
  async function cancel(userId) {
    const entries=[...(work.get(userId)||[])];
    entries.forEach(entry=>entry.controller.abort());
    await Promise.all(entries.map(entry=>entry.promise));
  }
  async function drain() {await Promise.all([...work.values()].flatMap(entries=>[...entries].map(entry=>entry.promise)));}
  return {enqueue,cancel,drain};
}
module.exports={createAccountJobs};
