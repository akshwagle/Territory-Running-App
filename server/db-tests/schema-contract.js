'use strict';

// Independent transcription of the Phase 1 written spec. This is deliberately
// not generated from Prisma: it catches missing/extra columns and wrong types.
// ?: nullable; t: timestamptz(6); vN: varchar(N); other type codes are below.
const columns = {
  users: 'id:u username:v30 email:v255 password_hash:x display_name:v60 role:SystemRole verified_at:t? deletion_at:t? created_at:t updated_at:t',
  auth_tokens: 'id:u user_id:u kind:TokenKind token_hash:v64 expires_at:t used_at:t? created_at:t',
  user_privacy_settings: 'user_id:u hide_route:o home_hex:b? hide_radius_m:i consent_at:t? terms_version:v10?',
  teams: 'id:u name:v50 color_hex:v7 invite_code:v12 created_at:t',
  team_members: 'user_id:u team_id:u role:TeamRole joined_at:t',
  follows: 'follower_id:u followee_id:u created_at:t',
  badges: 'id:u code:v40 name:v80 description:x? criteria:BadgeCriteria threshold:i',
  user_badges: 'user_id:u badge_id:u awarded_at:t',
  seasons: 'id:u name:v60 starts_at:t ends_at:t status:SeasonStatus',
  season_scores: 'season_id:u user_id:u hexes_held:i distance_m:b final_rank:i',
  user_stats: 'user_id:u total_runs:i total_dist_m:b streak_days:i best_streak:i last_run_on:d? updated_at:t',
  runs: 'id:u user_id:u client_run_id:u started_at:t ended_at:t distance_m:i duration_s:i route_polyline:x h3_resolution:s status:RunStatus mock_gps:o app_version:v20 created_at:t',
  run_points: 'id:b run_id:u seq:i lat:f lng:f recorded_at:t accuracy_m:r speed_mps:r?',
  run_flags: 'id:u run_id:u zone_id:u? reason:FlagReason details:x? status:FlagStatus reporter_id:u? resolver_id:u? created_at:t resolved_at:t?',
  hex_ownership: 'h3_index:b owner_id:u run_id:u claimed_at:t cooldown_until:t',
  run_hexes: 'run_id:u h3_index:b outcome:HexOutcome prev_owner_id:u? created_at:t',
  restricted_zones: 'id:u name:v100 reason:x active:o created_at:t',
  restricted_zone_hexes: 'zone_id:u h3_index:b',
  regions: 'id:u name:v80 city:v80 created_at:t',
  region_cells: 'region_id:u parent_h3:b',
  devices: 'id:u user_id:u fcm_token:v255 platform:v10 app_version:v20 last_seen_at:t created_at:t',
  notifications: 'id:u user_id:u type:NotificationType title:v100 body:x? read_at:t? created_at:t',
  admin_actions: 'id:u admin_id:u action:v50 target_type:v30 target_id:u note:x? created_at:t',
  login_attempts: 'id:b email:v255 ip_address:v45 success:o created_at:t',
  game_settings: 'key:v50 value:x description:x? updated_at:t',
  app_releases: 'id:u version_code:i version_name:v20 apk_url:x sha256:v64 changelog:x? is_active:o published_at:t',
};

const types = { u: 'uuid', x: 'text', t: 'timestamp(6) with time zone', b: 'bigint', i: 'integer', s: 'smallint', d: 'date', o: 'boolean', f: 'double precision', r: 'real' };
function expectedColumns() {
  return Object.entries(columns).flatMap(([table, fields]) => fields.split(' ').map((field) => {
    const [column, spec] = field.split(':');
    const nullable = spec.endsWith('?');
    const code = spec.replace(/\?$/, '');
    const type = types[code] || (/^v\d+$/.test(code) ? `character varying(${code.slice(1)})` : `"${code}"`);
    return { table, column, type, nullable };
  })).sort((a, b) => `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`));
}

const enums = {
  SystemRole: ['RUNNER', 'ADMIN'],
  TokenKind: ['REFRESH', 'PASSWORD_RESET', 'EMAIL_VERIFY'],
  TeamRole: ['CAPTAIN', 'MEMBER'],
  SeasonStatus: ['UPCOMING', 'ACTIVE', 'ENDED'],
  BadgeCriteria: ['TOTAL_DISTANCE', 'HEX_COUNT', 'STREAK_DAYS', 'RUN_COUNT'],
  RunStatus: ['UPLOADING', 'PENDING', 'VALID', 'FLAGGED', 'REJECTED'],
  HexOutcome: ['CAPTURED', 'REFRESHED', 'ON_COOLDOWN', 'RESTRICTED'],
  FlagReason: ['SPEED_LIMIT', 'GPS_JUMP', 'VEHICLE_PATTERN', 'MOCK_LOCATION', 'RESTRICTED_ZONE', 'USER_REPORT'],
  FlagStatus: ['OPEN', 'DISMISSED', 'CONFIRMED'],
  NotificationType: ['HEX_LOST', 'RUN_VALIDATED', 'RUN_FLAGGED', 'BADGE_EARNED', 'SEASON_ENDED', 'SYSTEM'],
};

// Child.column, parent.column, PostgreSQL ON DELETE action (c=CASCADE, n=SET NULL).
const foreignKeys = [
  ['auth_tokens.user_id', 'users.id', 'c'],
  ['user_privacy_settings.user_id', 'users.id', 'c'],
  ['team_members.user_id', 'users.id', 'c'], ['team_members.team_id', 'teams.id', 'c'],
  ['follows.follower_id', 'users.id', 'c'], ['follows.followee_id', 'users.id', 'c'],
  ['user_badges.user_id', 'users.id', 'c'], ['user_badges.badge_id', 'badges.id', 'c'],
  ['season_scores.season_id', 'seasons.id', 'c'], ['season_scores.user_id', 'users.id', 'c'],
  ['user_stats.user_id', 'users.id', 'c'], ['runs.user_id', 'users.id', 'c'],
  ['run_points.run_id', 'runs.id', 'c'], ['run_flags.run_id', 'runs.id', 'c'],
  ['run_flags.zone_id', 'restricted_zones.id', 'n'], ['run_flags.reporter_id', 'users.id', 'n'], ['run_flags.resolver_id', 'users.id', 'n'],
  ['hex_ownership.owner_id', 'users.id', 'c'], ['hex_ownership.run_id', 'runs.id', 'c'],
  ['run_hexes.run_id', 'runs.id', 'c'], ['restricted_zone_hexes.zone_id', 'restricted_zones.id', 'c'],
  ['region_cells.region_id', 'regions.id', 'c'], ['devices.user_id', 'users.id', 'c'], ['notifications.user_id', 'users.id', 'c'],
];

const keys = {
  users: ['p:id', 'u:username', 'u:email'], auth_tokens: ['p:id', 'u:token_hash'],
  user_privacy_settings: ['p:user_id'], teams: ['p:id', 'u:name', 'u:invite_code'],
  team_members: ['p:user_id'], follows: ['p:follower_id,followee_id'],
  badges: ['p:id', 'u:code'], user_badges: ['p:user_id,badge_id'],
  seasons: ['p:id', 'u:name'], season_scores: ['p:season_id,user_id'], user_stats: ['p:user_id'],
  runs: ['p:id', 'u:user_id,client_run_id'], run_points: ['p:id', 'u:run_id,seq'], run_flags: ['p:id'],
  hex_ownership: ['p:h3_index'], run_hexes: ['p:run_id,h3_index'], restricted_zones: ['p:id', 'u:name'],
  restricted_zone_hexes: ['p:zone_id,h3_index'], regions: ['p:id', 'u:name'], region_cells: ['p:region_id,parent_h3'],
  devices: ['p:id', 'u:fcm_token'], notifications: ['p:id'], admin_actions: ['p:id'], login_attempts: ['p:id'],
  game_settings: ['p:key'], app_releases: ['p:id', 'u:version_code'],
};

const indexes = [
  'auth_tokens:user_id,kind', 'runs:user_id,started_at', 'run_flags:status,created_at',
  'hex_ownership:owner_id,claimed_at', 'run_hexes:h3_index', 'devices:user_id',
  'notifications:user_id,read_at', 'login_attempts:email,created_at',
];

module.exports = { columns, expectedColumns, enums, foreignKeys, keys, indexes };
