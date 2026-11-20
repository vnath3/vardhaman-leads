import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'va_admin';
const SESSION_SECONDS = 12 * 60 * 60;

export const sha256 = value => createHash('sha256').update(String(value)).digest('hex');

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function verifyPassword(password, expectedSha256) {
  if (!expectedSha256 || typeof password !== 'string' || !password) return false;
  return safeEqual(sha256(password), String(expectedSha256).toLowerCase());
}

const sign = (secret, payload) => createHmac('sha256', secret).update(payload).digest('hex');

export function createSession(secret, now = Date.now()) {
  const expires = Math.floor(now / 1000) + SESSION_SECONDS;
  const payload = `${expires}.${randomBytes(8).toString('hex')}`;
  return `${payload}.${sign(secret, payload)}`;
}

export function verifySession(token, secret, now = Date.now()) {
  if (!token || !secret) return false;
  const parts = String(token).split('.');
  if (parts.length !== 3) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  if (!safeEqual(sign(secret, payload), parts[2])) return false;
  return Number(parts[0]) > Math.floor(now / 1000);
}

export function readCookie(header, name) {
  for (const part of String(header ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

export const sessionCookie = (token, secure = true) =>
  `${SESSION_COOKIE}=${token}; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`;
export const clearCookie = (secure = true) =>
  `${SESSION_COOKIE}=; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Strict; Path=/; Max-Age=0`;

// Best-effort limiter (per warm function instance). The password is what protects the data.
export function createLimiter(limit, windowMs) {
  const hits = new Map();
  return {
    take(key, now = Date.now()) {
      const recent = (hits.get(key) || []).filter(t => now - t < windowMs);
      if (recent.length >= limit) { hits.set(key, recent); return false; }
      recent.push(now); hits.set(key, recent);
      if (hits.size > 2000) hits.clear();
      return true;
    },
    reset(key) { hits.delete(key); }
  };
}
