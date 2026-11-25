'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {user}=require('./helpers');
module.exports=({pool})=>{
  async function fixture(task){const db=await pool.connect();try{await db.query('BEGIN');await task(db,await user(db));}finally{await db.query('ROLLBACK');db.release();}}
  const active=(db,owner)=>db.query(`INSERT INTO runs(user_id,client_run_id,started_at,distance_m,status,app_version) VALUES($1,$2,now(),0,'ACTIVE','test') RETURNING *`,[owner,randomUUID()]);
  async function rejected(db,sql,values,constraint){await db.query('SAVEPOINT invalid_record');try{await assert.rejects(()=>db.query(sql,values),e=>{assert.equal(e.code,'23514');if(constraint)assert.equal(e.constraint,constraint);return true;});}finally{await db.query('ROLLBACK TO SAVEPOINT invalid_record');}}
  test('LIFE-06 active/null state and paused-recording exclusivity are database constraints',()=>fixture(async(db,owner)=>{
    const run=(await active(db,owner.id)).rows[0];assert.equal(run.ended_at,null);assert.equal(run.duration_s,null);assert.deepEqual(run.run_signals,{});
    await rejected(db,"UPDATE runs SET status='PENDING_VALIDATION' WHERE id=$1",[run.id],'runs_recording_state_check');
    await rejected(db,"UPDATE runs SET ended_at=started_at+interval '1 minute',duration_s=60 WHERE id=$1",[run.id],'runs_recording_state_check');
    await db.query(`UPDATE runs SET run_signals='{"segments":[{"paused":true}]}' WHERE id=$1`,[run.id]);
    await db.query('SAVEPOINT duplicate_active');await assert.rejects(()=>active(db,owner.id),e=>e.code==='23505'&&e.constraint==='runs_one_active_user_key');await db.query('ROLLBACK TO SAVEPOINT duplicate_active');
    await db.query('UPDATE runs SET deleted_at=now() WHERE id=$1',[run.id]);assert.equal((await active(db,owner.id)).rowCount,1);
  }));
  test('LIFE-06 ten concurrent connections create one live ACTIVE run without deadlock',async()=>{
    const owner=await user(pool);try{const results=await Promise.allSettled(Array.from({length:10},()=>active(pool,owner.id)));
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const failures=results.filter(r=>r.status==='rejected');assert.equal(failures.length,9);assert.ok(failures.every(r=>r.reason.code==='23505'&&r.reason.constraint==='runs_one_active_user_key'));
      assert.equal((await pool.query("SELECT 1 FROM runs WHERE user_id=$1 AND status='ACTIVE' AND deleted_at IS NULL",[owner.id])).rowCount,1);
    }finally{await pool.query('DELETE FROM users WHERE id=$1',[owner.id]);}
  });
  test('LIFE-11 closed runs retain positive-time/duration checks and enforce the 24-hour limit',()=>fixture(async(db,owner)=>{
    const run=(await active(db,owner.id)).rows[0];
    for(const [end,duration,constraint] of [["started_at",1,'runs_time_order_check'],["started_at+interval '1 second'",0,'runs_duration_positive_check'],["started_at+interval '24 hours 1 second'",86401,'runs_max_length_check']])
      await rejected(db,`UPDATE runs SET status='PENDING_VALIDATION',ended_at=${end},duration_s=$2 WHERE id=$1`,[run.id,duration],constraint);
    await db.query("UPDATE runs SET status='PENDING_VALIDATION',ended_at=started_at+interval '24 hours',duration_s=86400 WHERE id=$1",[run.id]);
    await rejected(db,"UPDATE runs SET run_signals='[]' WHERE id=$1",[run.id],'runs_signals_object_check');
  }));
  test('GPS-05 provider and nullable mock signals preserve legacy unknown values',()=>fixture(async(db,owner)=>{
    const run=(await active(db,owner.id)).rows[0];const insert="INSERT INTO run_points(run_id,seq,lat,lng,recorded_at,accuracy_m,provider,is_mock) VALUES($1,$2,19,72,now(),5,$3,$4)";
    await db.query(insert,[run.id,0,'unknown',null]);await db.query(insert,[run.id,1,'network',false]);await db.query(insert,[run.id,2,'gps',true]);
    await rejected(db,insert,[run.id,3,'invented',false],'run_points_provider_check');
    const rows=(await db.query('SELECT provider,is_mock FROM run_points WHERE run_id=$1 ORDER BY seq',[run.id])).rows;assert.deepEqual(rows,[{provider:'unknown',is_mock:null},{provider:'network',is_mock:false},{provider:'gps',is_mock:true}]);
  }));
  test('GPS-06 point CHECKs reject non-finite/range/zero-pair coordinates, negative sequence, accuracy and speed',()=>fixture(async(db,owner)=>{
    const run=(await active(db,owner.id)).rows[0];const insert='INSERT INTO run_points(run_id,seq,lat,lng,recorded_at,accuracy_m,speed_mps) VALUES($1,$2,$3,$4,now(),$5,$6)';
    for(const values of [[-1,19,72,5,0],[0,'NaN',72,5,0],[0,'Infinity',72,5,0],[0,91,72,5,0],[0,19,-181,5,0],[0,0,0,5,0],[0,19,72,-1,0],[0,19,72,'NaN',0],[0,19,72,'Infinity',0],[0,19,72,5,-1],[0,19,72,5,'Infinity']])await rejected(db,insert,[run.id,...values]);
    await db.query(insert,[run.id,0,0,1,5,null]);
  }));
};
