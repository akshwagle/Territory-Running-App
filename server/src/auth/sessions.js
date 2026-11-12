'use strict';
const { failure, accountFailure, databaseNow, lockUser, revokeFamily } = require('./session-core');
function deviceLabel(agent) {
  const text = agent || '';
  const os = /Android/i.test(text) ? 'Android' : /iPhone|iPad/i.test(text) ? 'iOS' : /Macintosh|Mac OS/i.test(text) ? 'Mac' : /Windows/i.test(text) ? 'Windows' : 'Device';
  const browser = /Edg\//.test(text) ? 'Edge' : /Chrome\//.test(text) ? 'Chrome' : /Firefox\//.test(text) ? 'Firefox' : /Safari\//.test(text) ? 'Safari' : 'Browser';
  return text ? `${os} / ${browser}` : 'Unknown device';
}
function createSessionService(prisma) {
  async function list(req) {
    const rows = await prisma.$queryRaw`
      SELECT family_id AS id, min(created_at) AS "createdAt",
        max(COALESCE(used_at, created_at)) AS "lastUsedAt",
        (array_agg(user_agent ORDER BY created_at DESC, id DESC))[1] AS agent
      FROM auth_tokens WHERE user_id = ${req.authUser.id}::uuid AND kind = 'REFRESH'
      GROUP BY family_id
      HAVING bool_or(used_at IS NULL AND revoked_at IS NULL AND expires_at > clock_timestamp())
      ORDER BY min(created_at) DESC`;
    return { sessions: rows.map(({ agent, ...row }) => ({ ...row, deviceLabel: deviceLabel(agent), current: row.id === req.authSessionId })) };
  }
  async function revoke(id, req) {
    return prisma.$transaction(async tx => {
      const user = await lockUser(tx, req.authUser.id);
      const unavailable = accountFailure(user); if (unavailable) return unavailable;
      const row = await tx.authToken.findFirst({ where: { userId: user.id, familyId: id, kind: 'REFRESH' } });
      if (!row) return failure(404, 'SESSION_NOT_FOUND', 'The session was not found.');
      await revokeFamily(tx, id, await databaseNow(tx));
      return null;
    });
  }
  return { list, revoke };
}
module.exports = { createSessionService, deviceLabel };
