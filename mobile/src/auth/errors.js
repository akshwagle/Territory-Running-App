export class ApiError extends Error {
  constructor(code, message, status = 0, retryAfter = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function isConnectionError(error) {
  return ['NETWORK_UNAVAILABLE', 'REQUEST_TIMEOUT'].includes(error?.code);
}

export function isAccountError(error) {
  return ['ACCOUNT_SUSPENDED', 'ACCOUNT_DELETED'].includes(error?.code);
}

export function friendlyMessage(error) {
  if (error?.code === 'ACCOUNT_SUSPENDED') return 'Your account is suspended. Contact support before trying again.';
  if (error?.code === 'ACCOUNT_DELETED') return 'This account has been deleted or is awaiting deletion. Sign in to a different account or contact support if this was a mistake.';
  if (error?.code === 'RATE_LIMITED' && error.retryAfter) return `Too many attempts. Try again in ${error.retryAfter} seconds.`;
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
}
