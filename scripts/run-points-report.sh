#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
if (( $# > 1 )); then printf 'Usage: %s [run-uuid]\n' "$0" >&2; exit 2; fi
# Read-only psql report. Credentials go through child environment variables,
# never command arguments or output. No coordinates, emails or tokens selected.
node --input-type=commonjs - "$repo_root" "${1:-}" <<'JS'
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=process.argv[2],id=process.argv[3];
if(id&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)){console.error('Expected a run UUID.');process.exit(2);}
require(path.join(root,'server/node_modules/dotenv')).config({path:path.join(root,'server/.env')});
try{
 const url=new URL(process.env.DATABASE_URL);
 if(!['postgresql:','postgres:'].includes(url.protocol))throw Error();
 const bin=path.join(root,'.local/postgres16/bin/psql'),lib=path.join(root,'.local/postgres16/lib');
 const sql=`WITH recent AS (
  SELECT id,status,distance_m,duration_s,mock_gps,run_signals
  FROM runs WHERE deleted_at IS NULL ${id?`AND id='${id}'::uuid`:''}
  ORDER BY created_at DESC LIMIT 3
 ), ordered AS (
  SELECT run_id,seq,recorded_at,is_mock,
    lag(recorded_at) OVER (PARTITION BY run_id ORDER BY seq) AS previous_time
  FROM run_points WHERE run_id IN (SELECT id FROM recent)
 ) SELECT r.id AS run_id,r.status,r.distance_m,r.duration_s,r.mock_gps,
   count(p.seq) AS stored_points,count(DISTINCT p.seq) AS distinct_sequences,
   min(p.seq) AS first_seq,max(p.seq) AS last_seq,
   count(*) FILTER (WHERE p.is_mock) AS mock_points,
   count(*) FILTER (WHERE p.recorded_at-p.previous_time>interval '30 seconds') AS long_gaps,
   COALESCE(jsonb_array_length(r.run_signals->'segments'),0) AS segments
 FROM recent r LEFT JOIN ordered p ON p.run_id=r.id
 GROUP BY r.id,r.status,r.distance_m,r.duration_s,r.mock_gps,r.run_signals
 ORDER BY r.id;`;
 const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGCONNECT_TIMEOUT:'5',DYLD_LIBRARY_PATH:lib,LD_LIBRARY_PATH:lib};
 const result=spawnSync(bin,['-X','--no-password','--set','ON_ERROR_STOP=1','--pset','pager=off','--command',sql],{env,encoding:'utf8',timeout:15000});
 if(result.status!==0)throw Error();
 process.stdout.write(result.stdout);
}catch{console.error('Read-only point report failed. Check local PostgreSQL and server/.env; no connection settings were printed.');process.exit(1);}
JS
