'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { user, rejectsSql } = require('./helpers');

const TOMBSTONE = '00000000-0000-0000-0000-000000000000';

module.exports = function profilePrivacyCases({ pool }) {
  // Fixture writes and assertions run in real transactions. ROLLBACK cleans the
  // fixtures, including append-only rows, without deleting/truncating history or
  // disabling any trigger. Committed evidence below deliberately remains in the
  // disposable test DB until it is recreated through the guarded reset helper.
  async function fixture(action) {
    const db = await pool.connect();
    try { await db.query('BEGIN'); return await action(db); }
    finally { await db.query('ROLLBACK'); db.release(); }
  }
  async function rejected(db, sql, code = '55000', values = []) {
    await db.query('SAVEPOINT expected_rejection');
    try { await rejectsSql(() => db.query(sql, values), code); }
    finally { await db.query('ROLLBACK TO SAVEPOINT expected_rejection'); await db.query('RELEASE SAVEPOINT expected_rejection'); }
  }
  async function audit(db, actor, target, note = 'Audit fixture') {
    return (await db.query(`INSERT INTO admin_actions(admin_id,action,target_type,target_id,note)
      VALUES($1,'TEST_ACTION','USER',$2,$3) RETURNING *`, [actor, target, note])).rows[0];
  }

  test('PRIV-04 actual audit foreign keys, ON DELETE rules and users.username are inspected', async t => {
    const { rows } = await pool.query(`SELECT a.attname AS column, c.conname AS foreign_key,
      CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
        WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' ELSE 'NOT APPLICABLE (no FK)' END AS on_delete
      FROM pg_attribute a LEFT JOIN pg_constraint c ON c.conrelid=a.attrelid
        AND c.contype='f' AND a.attnum=ANY(c.conkey)
      WHERE a.attrelid='admin_actions'::regclass AND a.attname IN ('admin_id','target_id') ORDER BY a.attname`);
    assert.deepEqual(rows, ['admin_id', 'target_id'].map(column => ({ column, foreign_key: null, on_delete: 'NOT APPLICABLE (no FK)' })));
    const username = (await pool.query(`SELECT data_type,character_maximum_length,is_nullable
      FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='username'`)).rows;
    assert.deepEqual(username, [{ data_type: 'character varying', character_maximum_length: 30, is_nullable: 'NO' }]);
    t.diagnostic('Actual admin_actions FKs: '+JSON.stringify(rows));
    t.diagnostic('Actual users.username: '+JSON.stringify(username[0]));
  });

  test('PRIV-04 committed DELETE of actor, target and both redacts to a tombstone that is not a user', async t => {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const survivor = await user(db), actor = await user(db), target = await user(db), both = await user(db);
      const entries = [await audit(db, actor.id, survivor.id), await audit(db, survivor.id, target.id), await audit(db, both.id, both.id)];
      for (const deleted of [actor, target, both]) await db.query('DELETE FROM users WHERE id=$1', [deleted.id]);
      const rows = [];
      for (const entry of entries) rows.push((await db.query('SELECT * FROM admin_actions WHERE id=$1', [entry.id])).rows[0]);
      for (let i = 0; i < rows.length; i++) assert.deepEqual(rows[i], { ...entries[i],
        admin_id: i === 1 ? survivor.id : TOMBSTONE, target_id: i === 0 ? survivor.id : TOMBSTONE, note: null });
      assert.equal((await db.query('SELECT 1 FROM users WHERE id=$1', [TOMBSTONE])).rowCount, 0);
      assert.equal((await db.query('SELECT 1 FROM users WHERE id=ANY($1::uuid[])', [[actor.id,target.id,both.id]])).rowCount, 0);
      await db.query('COMMIT');
      assert.equal((await pool.query('SELECT 1 FROM admin_actions WHERE id=ANY($1::uuid[])', [entries.map(row=>row.id)])).rowCount, 3);
      t.diagnostic('Committed actor=true; target=true; both=true; action/admin/time preserved; tombstone_user_exists=false.');
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  });

  test('PRIV-04 multi-row DELETE handles shared audit rows and clears its transaction context', async t => fixture(async db => {
    const a = await user(db), b = await user(db);
    const entry = await audit(db, a.id, b.id);
    const removed = await db.query('DELETE FROM users WHERE id=ANY($1::uuid[]) RETURNING username', [[a.id,b.id]]);
    assert.equal(removed.rowCount, 2);
    assert.ok(removed.rows.every(row=>typeof row.username==='string'));
    const row = (await db.query('SELECT * FROM admin_actions WHERE id=$1',[entry.id])).rows[0];
    assert.deepEqual(row, { ...entry, admin_id:TOMBSTONE, target_id:TOMBSTONE, note:null });
    const settings = (await db.query(`SELECT current_setting('territory.audit_erasure_active',true) AS active,
      current_setting('territory.audit_erasure_pending',true)::jsonb AS pending`)).rows[0];
    assert.equal(settings.active,''); assert.deepEqual(settings.pending,{});
    t.diagnostic('Real multi-row DELETE returned 2 usernames; both audit IDs tombstoned; context cleared.');
  }));

  test('PRIV-04 rolled-back DELETE restores the user and every original audit field', async t => fixture(async db => {
    const deleted = await user(db), survivor = await user(db), entry = await audit(db, survivor.id, deleted.id, 'Retained before rollback');
    await db.query('SAVEPOINT before_erasure');
    await db.query('DELETE FROM users WHERE id=$1',[deleted.id]);
    assert.equal((await db.query('SELECT note FROM admin_actions WHERE id=$1',[entry.id])).rows[0].note,null);
    await db.query('ROLLBACK TO SAVEPOINT before_erasure');
    assert.equal((await db.query('SELECT 1 FROM users WHERE id=$1',[deleted.id])).rowCount,1);
    assert.deepEqual((await db.query('SELECT * FROM admin_actions WHERE id=$1',[entry.id])).rows[0],entry);
    t.diagnostic('DELETE executed, then rollback: user restored=true; audit byte-for-field unchanged=true.');
  }));

  test('PRIV-04 email, name, ID and pre-cascade identity/name-history mentions are erased; unrelated notes survive', async t => fixture(async db => {
    const deleted = await user(db, { displayName:'Ann Trail' }), survivor = await user(db);
    await db.query(`INSERT INTO auth_identities(user_id,provider,provider_subject,email_at_signup)
      VALUES($1,'GOOGLE',$2,$3)`,[deleted.id,'test_google_subject_for_erasure','old-identity@example.test']);
    await db.query(`INSERT INTO display_name_history(user_id,display_name,name_key)
      VALUES($1,'Former Trail',profile_name_key('Former Trail'))`,[deleted.id]);
    const values = [deleted.email,deleted.display_name,deleted.id,'old-identity@example.test','Former Trail','test_google_subject_for_erasure'];
    const entries = [];
    for (const value of values) entries.push(await audit(db,survivor.id,survivor.id,`Mention: ${value.toUpperCase()}.`));
    const unrelated = await audit(db,survivor.id,survivor.id,'Annual trail maintenance completed.');
    await db.query('DELETE FROM users WHERE id=$1',[deleted.id]);
    for (const entry of entries) assert.deepEqual((await db.query('SELECT * FROM admin_actions WHERE id=$1',[entry.id])).rows[0],{...entry,note:null});
    assert.deepEqual((await db.query('SELECT * FROM admin_actions WHERE id=$1',[unrelated.id])).rows[0],unrelated);
    assert.equal((await db.query('SELECT 1 FROM auth_identities WHERE user_id=$1',[deleted.id])).rowCount,0);
    assert.equal((await db.query('SELECT 1 FROM display_name_history WHERE user_id=$1',[deleted.id])).rowCount,0);
    t.diagnostic('email/name/ID/identity/old-name mentions redacted=true; unrelated note unchanged=true.');
  }));

  test('PRIV-04 forged SET LOCAL audit erasure settings cannot permit plain-SQL UPDATE', async t => fixture(async db => {
    const actor = await user(db), entry = await audit(db,actor.id,actor.id);
    const fake = randomUUID();
    await db.query(`SELECT set_config('territory.audit_erasure_active',$1,true),
      set_config('territory.audit_erasure_pending',jsonb_build_object($1::text,
        jsonb_build_object('user_id',$1::text,'transaction_id',pg_current_xact_id()::text,'identifiers',jsonb_build_array('fixture')))::text,true)`,[fake]);
    await rejected(db,'UPDATE admin_actions SET note=NULL WHERE id=$1','55000',[entry.id]);
    assert.deepEqual((await db.query('SELECT * FROM admin_actions WHERE id=$1',[entry.id])).rows[0],entry);
    t.diagnostic('Forged SET LOCAL + plain SQL rejected with SQLSTATE 55000; audit unchanged.');
  }));

  test('PRIV-04 ordinary UPDATE DELETE TRUNCATE remain blocked on all three immutable-history tables', async t => fixture(async db => {
    const owner = await user(db);
    await audit(db,owner.id,owner.id);
    await db.query(`INSERT INTO user_consents(user_id,type,version,accepted) VALUES($1,'LOCATION','v1',true)`,[owner.id]);
    await db.query(`INSERT INTO display_name_history(user_id,display_name,name_key) VALUES($1,'History Name',profile_name_key('History Name'))`,[owner.id]);
    const updates = { admin_actions:"note='forbidden'", user_consents:'accepted=false', display_name_history:"display_name='Other Name'" };
    for (const [table,set] of Object.entries(updates)) {
      for (const sql of [`UPDATE ${table} SET ${set}`,`DELETE FROM ${table}`,`TRUNCATE ${table}`]) await rejected(db,sql);
      t.diagnostic(`${table}: UPDATE=55000 DELETE=55000 TRUNCATE=55000; no guard disabled.`);
    }
    await rejected(db,'UPDATE admin_actions SET note=NULL WHERE false');
  }));

  test('PRIV-04 complete-row guard rejects an extra action mutation during the actual deletion update', async () => fixture(async db => {
    const owner = await user(db); await audit(db,owner.id,owner.id);
    await db.query(`CREATE FUNCTION audit_test_tamper() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN NEW.action := 'FORGED'; RETURN NEW; END $$`);
    await db.query(`CREATE TRIGGER aa_audit_test_tamper BEFORE UPDATE ON admin_actions
      FOR EACH ROW EXECUTE FUNCTION audit_test_tamper()`);
    await rejected(db,'DELETE FROM users WHERE id=$1','55000',[owner.id]);
    assert.equal((await db.query('SELECT 1 FROM users WHERE id=$1',[owner.id])).rowCount,1);
    assert.equal((await db.query('SELECT action FROM admin_actions WHERE admin_id=$1',[owner.id])).rows[0].action,'TEST_ACTION');
  }));

  test('PRIV-04 audit tombstone is reserved from real user rows', async () => fixture(async db => {
    await rejected(db,`INSERT INTO users(id,username,email,password_hash,display_name,updated_at)
      VALUES($1,'reserved_tombstone','tombstone@example.test','fixture','Reserved Tombstone',now())`,'23514',[TOMBSTONE]);
    assert.equal((await db.query('SELECT 1 FROM users WHERE id=$1',[TOMBSTONE])).rowCount,0);
  }));

  test('PRIV-07 canonical name uniqueness and profile CHECKs reject invalid writes without truncation', async () => fixture(async db => {
    const name=`Name ${randomUUID().slice(0,8)}`,owner=await user(db,{displayName:name});
    await db.query('SAVEPOINT duplicate_name');
    await rejectsSql(()=>user(db,{displayName:name.toUpperCase()}),'23505','users_display_name_key');
    await db.query('ROLLBACK TO SAVEPOINT duplicate_name');
    for(const value of ['Li','a'.repeat(25),'  Noncanonical  ']) {
      await rejected(db,'UPDATE users SET display_name=$2 WHERE id=$1','23514',[owner.id,value]);
    }
    for(const [column,value] of [['avatar_id',12],['avatar_color','#FFFFFF'],['preferred_units','xx']]) {
      await rejected(db,`UPDATE users SET ${column}=$2 WHERE id=$1`,'23514',[owner.id,value]);
    }
    await rejected(db,'UPDATE users SET home_region_id=$2 WHERE id=$1','23503',[owner.id,randomUUID()]);
    await rejected(db,'UPDATE users SET bio=$2 WHERE id=$1','22001',[owner.id,'a'.repeat(141)]);
    const index=(await db.query(`SELECT indisunique,indisvalid,pg_get_expr(indexprs,indrelid) AS expression
      FROM pg_index WHERE indexrelid='users_display_name_key'::regclass`)).rows[0];
    assert.equal(index.indisunique,true);assert.equal(index.indisvalid,true);assert.match(index.expression,/profile_name_key/);
  }));

  test('PRIV-03 consent history is ordered, version constrained and erased only by the parent cascade', async () => fixture(async db => {
    const owner=await user(db),ids=[];
    for(const accepted of [true,false,true]) ids.push((await db.query(`INSERT INTO user_consents(user_id,type,version,accepted,created_at)
      VALUES($1,'LOCATION','v1',$2,'2026-01-01T00:00:00Z') RETURNING id`,[owner.id,accepted])).rows[0].id);
    assert.equal(new Set(ids).size,3);
    assert.deepEqual((await db.query('SELECT accepted FROM user_consents WHERE user_id=$1 ORDER BY id',[owner.id])).rows.map(row=>row.accepted),[true,false,true]);
    await rejected(db,`INSERT INTO user_consents(user_id,type,version,accepted) VALUES($1,'LOCATION','bad version',true)`,'23514',[owner.id]);
    await db.query('DELETE FROM users WHERE id=$1',[owner.id]);
    assert.equal((await db.query('SELECT 1 FROM user_consents WHERE user_id=$1',[owner.id])).rowCount,0);
  }));

  test('PRIV-06 export key TTL state and one-active-export constraints are enforced with cascade erasure',async()=>fixture(async db=>{
    const owner=await user(db),key=randomBytes(32);
    const insert=()=>db.query('INSERT INTO data_exports(user_id,encryption_key) VALUES($1,$2) RETURNING *',[owner.id,key]);
    const first=(await insert()).rows[0];
    assert.equal(first.expires_at-first.created_at,86400000);assert.equal(first.status,'PENDING');
    await rejected(db,'INSERT INTO data_exports(user_id,encryption_key) VALUES($1,$2)','23505',[owner.id,key]);
    await rejected(db,'UPDATE data_exports SET completed_at=clock_timestamp() WHERE id=$1','23514',[first.id]);
    await rejected(db,"UPDATE data_exports SET expires_at=created_at+interval '25 hours' WHERE id=$1",'23514',[first.id]);
    await rejected(db,'UPDATE data_exports SET encryption_key=$2 WHERE id=$1','23514',[first.id,randomBytes(31)]);
    await db.query("UPDATE data_exports SET status='READY',completed_at=clock_timestamp() WHERE id=$1",[first.id]);
    await rejected(db,'INSERT INTO data_exports(user_id,encryption_key) VALUES($1,$2)','23505',[owner.id,key]);
    await db.query("UPDATE data_exports SET status='FAILED' WHERE id=$1",[first.id]);
    await insert();
    await db.query('DELETE FROM users WHERE id=$1',[owner.id]);
    assert.equal((await db.query('SELECT 1 FROM data_exports WHERE user_id=$1',[owner.id])).rowCount,0);
  }));
};
