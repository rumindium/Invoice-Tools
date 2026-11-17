import type { CookieOptions, Request } from 'express';

export const SESSION_COOKIE_NAME =
  process.env['NODE_ENV'] === 'production' ? '__Host-rinv_session' : 'rinv_session';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function sessionCookieOptions(maxAge?: number): CookieOptions {
  const options: CookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
  };

  if (maxAge !== undefined) {
    options.maxAge = maxAge;
  }

  return options;
}

export function readSessionToken(request: Request): string | undefined {
  const header = request.headers.cookie;
  if (!header) {
    return undefined;
  }

  for (const part of header.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName === SESSION_COOKIE_NAME) {
      return decodeURIComponent(rawValue.join('='));
    }
  }

  return undefined;
}
