export const session = (suffix = 'old') => ({ accessToken: `header.${suffix}.signature`, refreshToken: suffix[0].repeat(43),
  expiresIn: 900, user: { id: 'user-one', email: 'runner@example.test', displayName: 'Trail Runner' } });
export function memoryStorage() {
  const records = new Map();
  return { records, get: async key => records.get(key) ?? null,
    set: async (key, value) => { records.set(key, structuredClone(value)); }, remove: async key => { records.delete(key); } };
}
export const response = (status, payload) => new Response(status === 204 ? null : JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
