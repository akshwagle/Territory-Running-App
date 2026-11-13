const commonPasswords = new Set(['password', 'password1', 'password12', 'password123', 'password1234',
  '1234567890', '12345678901', '123456789012', 'qwerty12345', 'qwertyuiop', 'letmein1234',
  'welcome123', 'welcome1234', 'iloveyou123']);

export function normalizeEmail(value) {
  if (typeof value !== 'string' || value.length > 1024) return null;
  const text = value.trim().toLowerCase();
  if (/[\s\p{C}]/u.test(text)) return null;
  const parts = text.split('@');
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (!local || local.length > 64 || !/^[a-z0-9!#$%&'*+\-/=?^_`{|}~.]+$/.test(local) ||
    local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  try {
    // Match Node domainToASCII's host parsing before applying the server's
    // label/length rules. The canonical email sent to the API has no delimiters.
    const host = domain.split(/[/?#\\]/)[0];
    if (!host || [':', '@', '[', ']'].some(character => host.includes(character))) return null;
    const url = new URL(`http://${host}`);
    if (url.username || url.password || url.port) return null;
    const labels = url.hostname.split('.');
    if (labels.length < 2 || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
    const result = `${local}@${url.hostname}`;
    return result.length <= 254 ? result : null;
  } catch { return null; }
}

export function passwordError(value, existing = false) {
  const size = [...(value || '')].length;
  if (size < (existing ? 1 : 10) || size > 128) return existing ? 'Enter your password (up to 128 characters).' : 'Use 10–128 characters.';
  if (!existing && commonPasswords.has(value.toLowerCase())) return 'Choose a less common password.';
  return null;
}

export function normalizeDisplayName(value) {
  if (typeof value !== 'string' || value.length > 240 || /[\p{C}\p{Extended_Pictographic}]/u.test(value)) return null;
  const result = value.normalize('NFKC').trim().replace(/ +/g, ' ');
  if ([...result].length < 3 || [...result].length > 24 || !/^[\p{L}\p{M}\p{N} .'-]+$/u.test(result)) return null;
  if (['admin', 'administrator', 'support', 'territoryrun'].includes(result.toLowerCase().replace(/[ .'-]/g, ''))) return null;
  const denied = new Set(['fuck', 'shit', 'bitch', 'cunt', 'nigger', 'nazi']);
  return result.toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).some(word=>denied.has(word)) ? null : result;
}

export function formErrors(kind, values) {
  const errors = {};
  if (['signup', 'login', 'forgot'].includes(kind) && !normalizeEmail(values.email)) errors.email = 'Enter a valid email address (up to 254 characters).';
  if (kind === 'signup' && !normalizeDisplayName(values.displayName)) errors.displayName = 'Use 3–24 letters, numbers, spaces or . ’ -; choose a name without profanity or reserved account names.';
  if (['signup', 'login'].includes(kind)) errors.password = passwordError(values.password, kind === 'login');
  if (['reset', 'change'].includes(kind)) errors.newPassword = passwordError(values.newPassword);
  if (kind === 'change') errors.currentPassword = passwordError(values.currentPassword, true);
  return Object.fromEntries(Object.entries(errors).filter(([, error]) => error));
}
