import { validateLead, validateEvent, validateStatusUpdate, clean } from './validate.mjs';
import { newLead } from './store.mjs';
import { CONSENT_VERSION } from './config.mjs';
import { REMEMBER_SECONDS, SESSION_SECONDS, createLimiter, verifyPassword, createSession, verifySession, readCookie, sessionCookie, clearCookie, SESSION_COOKIE } from './auth.mjs';
import { summarize, istTime } from './stats.mjs';

const MAX_BODY = 4096;
export const limiters = {
  lead: createLimiter(10, 60 * 60 * 1000),
  event: createLimiter(200, 60 * 60 * 1000),
  login: createLimiter(5, 15 * 60 * 1000)
};

const clientIp = request => (request.headers.get('x-nf-client-connection-ip') || request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
const allowedOrigins = (request, env) => new Set([new URL(request.url).origin, ...String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)]);
// Netlify preview builds of the academy site (deploy-preview-12--va-academy..., preview--va-academy...) may send test leads.
const PREVIEW_ORIGIN = /^https:\/\/(?:deploy-preview-\d+|preview)--va-academy\.netlify\.app$/;
const originAllowed = (request, env, origin) => allowedOrigins(request, env).has(origin) || PREVIEW_ORIGIN.test(origin);

function corsHeaders(request, env) {
  const origin = request.headers.get('origin');
  return origin && originAllowed(request, env, origin)
    ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'Origin' }
    : { vary: 'Origin' };
}
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) return null;
  try { return JSON.parse(text); } catch { return null; }
}
// Public endpoints accept the site's origin (and the configured list); requests with no Origin are non-browser clients and are rate-limited like any other.
function originBlocked(request, env) {
  const origin = request.headers.get('origin');
  return Boolean(origin) && !originAllowed(request, env, origin);
}

export async function handleLead(request, { store, env = process.env, geo = null }) {
  const cors = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' }, cors);
  if (originBlocked(request, env)) return json(403, { error: 'forbidden' }, cors);
  if (!limiters.lead.take(clientIp(request))) return json(429, { error: 'too_many_requests' }, cors);
  const body = await readJson(request);
  if (!body) return json(400, { error: 'bad_request' }, cors);
  const result = validateLead(body);
  if (!result.ok) return json(422, { error: 'invalid', fields: result.errors }, cors);
  if (result.bot) return json(200, { ok: true }, cors); // pretend success; store nothing
  if (!store) return json(503, { error: 'not_configured' }, cors);
  try {
    // City and region come from the visitor's connection (approximate; mobile data can show the nearest big city).
    const where = { city: clean(geo?.city, 60), region: clean(geo?.subdivision?.name || geo?.subdivision?.code, 60) };
    const now = new Date();
    const { duplicate, existing } = await store.addLeadUnique(newLead({ ...result.value, ...where }, now, CONSENT_VERSION), 86400000);
    if (duplicate && existing?.id) { // a repeat enquiry is a warm signal: note it on the existing lead instead of dropping it silently
      try {
        const via = [result.value.device, result.value.trigger].filter(Boolean).join(', ');
        const line = `Repeat enquiry ${istTime(now)}${via ? ` (${via})` : ''}`;
        await store.updateLead(existing.id, { repeats: String((Number(existing.repeats) || 0) + 1), notes: [existing.notes, line].filter(Boolean).join(' | ').slice(-500) });
      } catch (error) { console.error('repeat note failed:', error.message); }
    }
    return json(200, duplicate ? { ok: true, duplicate: true } : { ok: true }, cors);
  } catch (error) {
    console.error('lead save failed:', error.message);
    return json(502, { error: 'save_failed' }, cors);
  }
}

export async function handleEvent(request, { store, env = process.env }) {
  const cors = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' }, cors);
  if (originBlocked(request, env)) return json(403, { error: 'forbidden' }, cors);
  if (!limiters.event.take(clientIp(request))) return json(429, { error: 'too_many_requests' }, cors);
  const body = await readJson(request); // sendBeacon posts JSON as text/plain; readJson handles both
  const result = validateEvent(body);
  if (!result.ok) return json(422, { error: 'invalid' }, cors);
  if (!store) return new Response(null, { status: 204, headers: cors });
  try { await store.addEvent({ ts: new Date().toISOString(), ...result.value }); } catch (error) { console.error('event save failed:', error.message); }
  return new Response(null, { status: 204, headers: cors });
}

export async function handleAdmin(request, { store, env = process.env }) {
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\/admin\/?/, '').replace(/\/$/, '');
  const secure = url.protocol === 'https:';
  if (!env.ADMIN_PASSWORD_SHA256 || !env.SESSION_SECRET) return json(503, { error: 'not_configured' });

  if (request.method === 'POST') { // basic CSRF guard on top of SameSite=Strict
    const origin = request.headers.get('origin');
    if (request.headers.get('x-requested-with') !== 'fetch' || (origin && new URL(origin).host !== url.host)) return json(403, { error: 'forbidden' });
  }

  if (route === 'login' && request.method === 'POST') {
    const ip = clientIp(request);
    if (!limiters.login.take(ip)) return json(429, { error: 'too_many_attempts' });
    const body = await readJson(request);
    if (!body || !verifyPassword(body.password, env.ADMIN_PASSWORD_SHA256)) {
      await new Promise(resolve => setTimeout(resolve, 400));
      return json(401, { error: 'wrong_password' });
    }
    limiters.login.reset(ip);
    const seconds = body.remember === true ? REMEMBER_SECONDS : SESSION_SECONDS;
    return json(200, { ok: true }, { 'set-cookie': sessionCookie(createSession(env.SESSION_SECRET, Date.now(), seconds), secure, seconds) });
  }
  if (route === 'logout' && request.method === 'POST') return json(200, { ok: true }, { 'set-cookie': clearCookie(secure) });

  if (!verifySession(readCookie(request.headers.get('cookie'), SESSION_COOKIE), env.SESSION_SECRET)) return json(401, { error: 'unauthorized' });
  if (!store) return json(503, { error: 'storage_not_configured' });

  try {
    if (route === 'data' && request.method === 'GET') {
      const days = Math.min(90, Math.max(7, Number(url.searchParams.get('days')) || 30));
      const [leads, events] = await Promise.all([store.listLeads(), store.listEvents()]);
      leads.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return json(200, { leads, summary: summarize(leads, events, new Date(), days), storage: store.kind });
    }
    if (route === 'status' && request.method === 'POST') {
      const result = validateStatusUpdate(await readJson(request));
      if (!result.ok) return json(422, { error: 'invalid' });
      return (await store.updateLead(result.id, result.patch)) ? json(200, { ok: true }) : json(404, { error: 'not_found' });
    }
  } catch (error) {
    console.error('admin request failed:', error.message);
    return json(502, { error: 'storage_error' });
  }
  return json(404, { error: 'not_found' });
}
