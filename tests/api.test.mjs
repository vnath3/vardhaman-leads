import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { validateLead, validateEvent, validateStatusUpdate, normalizePhone } from '../lib/validate.mjs';
import { sha256, verifyPassword, createSession, verifySession, createLimiter } from '../lib/auth.mjs';
import { createFileStore, createSheetsStore, createStore } from '../lib/store.mjs';
import { handleLead, handleEvent, handleAdmin, limiters } from '../lib/handlers.mjs';
import { summarize, istDay } from '../lib/stats.mjs';

const env = { ADMIN_PASSWORD_SHA256: sha256('correct horse'), SESSION_SECRET: 'x'.repeat(40), ALLOWED_ORIGINS: 'https://va-academy.netlify.app' };
const post = (url, body, headers = {}) => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const goodLead = { name: 'Priya Kulkarni', phone: '98765 43210', class_band: '5-7', source: '/classes/' };
const freshStore = async () => createFileStore(await mkdtemp(path.join(tmpdir(), 'leads-')));
const reset = () => { for (const l of Object.values(limiters)) l.reset?.('unknown'); limiters.lead = createLimiter(10, 3600000); limiters.event = createLimiter(200, 3600000); limiters.login = createLimiter(5, 900000); };

test('phone numbers normalise to 10 Indian mobile digits', () => {
  assert.equal(normalizePhone('+91 98765-43210'), '9876543210');
  assert.equal(normalizePhone('09876543210'), '9876543210');
  assert.equal(normalizePhone('1234567890'), null);
  assert.equal(normalizePhone('98765'), null);
});

test('lead validation rejects bad input and flags the honeypot', () => {
  assert.equal(validateLead({}).ok, false);
  assert.equal(validateLead({ ...goodLead, class_band: '11' }).errors.class_band.length > 0, true);
  const ok = validateLead({ ...goodLead, name: '  Priya <b>K</b> ' });
  assert.equal(ok.ok, true); assert.equal(ok.value.name, 'Priya b K /b'); assert.equal(ok.value.phone, '9876543210');
  assert.equal(validateLead({ ...goodLead, website: 'http://spam' }).bot, true);
});

test('event and status validation use allowlists', () => {
  assert.equal(validateEvent({ type: 'cta', action: 'call', page: '/' }).ok, true);
  assert.equal(validateEvent({ type: 'cta', action: 'drop table' }).ok, false);
  assert.equal(validateEvent({ type: 'other' }).ok, false);
  assert.equal(validateStatusUpdate({ id: 'a1', status: 'hot' }).ok, true);
  assert.equal(validateStatusUpdate({ id: 'a1', status: 'rich' }).ok, false);
  assert.equal(validateStatusUpdate({ status: 'hot' }).ok, false);
});

test('passwords and sessions', () => {
  assert.equal(verifyPassword('correct horse', env.ADMIN_PASSWORD_SHA256), true);
  assert.equal(verifyPassword('wrong', env.ADMIN_PASSWORD_SHA256), false);
  assert.equal(verifyPassword('', env.ADMIN_PASSWORD_SHA256), false);
  const token = createSession(env.SESSION_SECRET);
  assert.equal(verifySession(token, env.SESSION_SECRET), true);
  assert.equal(verifySession(token, 'other-secret'), false);
  assert.equal(verifySession(token.replace(/.$/, c => (c === 'a' ? 'b' : 'a')), env.SESSION_SECRET), false);
  assert.equal(verifySession(token, env.SESSION_SECRET, Date.now() + 13 * 3600 * 1000), false);
});

test('lead endpoint: saves, dedupes, blocks bots and foreign origins, answers 503 when unconfigured', async () => {
  reset();
  const store = await freshStore();
  let res = await handleLead(post('https://x.test/api/lead', goodLead, { origin: 'https://va-academy.netlify.app' }), { store, env });
  assert.equal(res.status, 200); assert.equal(res.headers.get('access-control-allow-origin'), 'https://va-academy.netlify.app');
  assert.equal((await store.listLeads()).length, 1);
  res = await handleLead(post('https://x.test/api/lead', goodLead), { store, env });
  assert.equal((await res.json()).duplicate, true); assert.equal((await store.listLeads()).length, 1);
  res = await handleLead(post('https://x.test/api/lead', { ...goodLead, phone: '9123456789', website: 'bot' }), { store, env });
  assert.equal(res.status, 200); assert.equal((await store.listLeads()).length, 1);
  for (const [origin, allowed] of [['https://deploy-preview-7--va-academy.netlify.app', true], ['https://preview--va-academy.netlify.app', true], ['https://deploy-preview-7--va-academy.netlify.app.evil.example', false], ['https://evil--va-academy.netlify.app', false]]) {
    const r = await handleLead(new Request('https://x.test/api/lead', { method: 'OPTIONS', headers: { origin } }), { store, env });
    assert.equal(r.headers.get('access-control-allow-origin'), allowed ? origin : null, origin);
  }
  res = await handleLead(post('https://x.test/api/lead', goodLead, { origin: 'https://evil.example' }), { store, env });
  assert.equal(res.status, 403);
  res = await handleLead(post('https://x.test/api/lead', { name: 'A' }), { store, env });
  assert.equal(res.status, 422);
  res = await handleLead(post('https://x.test/api/lead', { ...goodLead, phone: '9000000001' }), { store: null, env });
  assert.equal(res.status, 503);
  res = await handleLead(new Request('https://x.test/api/lead', { method: 'OPTIONS', headers: { origin: 'https://va-academy.netlify.app' } }), { store, env });
  assert.equal(res.status, 204);
});

test('lead endpoint rate limits per IP', async () => {
  reset(); const store = await freshStore(); let last;
  for (let i = 0; i < 11; i++) last = await handleLead(post('https://x.test/api/lead', { ...goodLead, phone: `90000000${String(i).padStart(2, '0')}` }), { store, env });
  assert.equal(last.status, 429);
});

test('event endpoint accepts beacons sent as text/plain', async () => {
  reset(); const store = await freshStore();
  const res = await handleEvent(new Request('https://x.test/api/event', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ type: 'cta', action: 'whatsapp', page: '/' }) }), { store, env });
  assert.equal(res.status, 204); assert.equal((await store.listEvents()).length, 1);
});

test('admin: login, data, status update, logout, and everything is locked without a session', async () => {
  reset(); const store = await freshStore();
  await handleLead(post('https://x.test/api/lead', goodLead), { store, env });
  const admin = (path, init = {}) => handleAdmin(new Request('https://x.test/api/admin/' + path, { ...init, headers: { 'x-requested-with': 'fetch', origin: 'https://x.test', ...(init.headers || {}) } }), { store, env });
  assert.equal((await admin('data')).status, 401);
  assert.equal((await admin('login', { method: 'POST', body: JSON.stringify({ password: 'nope' }) })).status, 401);
  const noCsrf = await handleAdmin(new Request('https://x.test/api/admin/login', { method: 'POST', body: JSON.stringify({ password: 'correct horse' }) }), { store, env });
  assert.equal(noCsrf.status, 403);
  const login = await admin('login', { method: 'POST', body: JSON.stringify({ password: 'correct horse' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie'); assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
  const headers = { cookie: cookie.split(';')[0] };
  const data = await (await admin('data', { headers })).json();
  assert.equal(data.leads.length, 1); assert.equal(data.summary.totals.today, 1);
  const id = data.leads[0].id;
  assert.equal((await admin('status', { method: 'POST', headers, body: JSON.stringify({ id, status: 'hot', notes: 'Call after 5 pm' }) })).status, 200);
  const after = await (await admin('data', { headers })).json();
  assert.equal(after.leads[0].status, 'hot'); assert.equal(after.summary.totals.hot, 1); assert.equal(after.leads[0].notes, 'Call after 5 pm');
  assert.equal((await admin('status', { method: 'POST', headers, body: JSON.stringify({ id: 'missing', status: 'hot' }) })).status, 404);
  assert.equal((await handleAdmin(new Request('https://x.test/api/admin/data'), { store, env: {} })).status, 503);
});

test('login is limited after repeated wrong passwords', async () => {
  reset(); const store = await freshStore(); let last;
  for (let i = 0; i < 6; i++) last = await handleAdmin(new Request('https://x.test/api/admin/login', { method: 'POST', headers: { 'x-requested-with': 'fetch' }, body: JSON.stringify({ password: 'bad' + i }) }), { store, env });
  assert.equal(last.status, 429);
});

test('stats use India time and zero-fill days', () => {
  const now = new Date('2026-11-21T20:00:00Z'); // 01:30 on 22 Nov in IST
  assert.equal(istDay(now), '2026-11-22');
  const leads = [{ created_at: '2026-11-21T19:00:00Z', status: 'new', class_band: '1-4', source: '/classes/' }, { created_at: '2026-11-10T05:00:00Z', status: 'hot', class_band: '8-10', source: '', utm_source: 'google' }];
  const events = [{ ts: '2026-11-21T10:00:00Z', type: 'form_view' }, { ts: '2026-11-21T10:01:00Z', type: 'cta', action: 'call' }];
  const s = summarize(leads, events, now, 30);
  assert.equal(s.perDay.length, 30); assert.equal(s.totals.today, 1); assert.equal(s.totals.hot, 1);
  assert.equal(s.funnel.formViews7, 1); assert.equal(s.funnel.conversionPct7, 100); assert.equal(s.ctaByAction.call, 1);
  assert.deepEqual(s.bySource.map(r => r[0]).sort(), ['/classes/', 'google']);
});

test('Google Sheets store talks to the Sheets API correctly (mocked)', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const calls = []; let rows = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url); calls.push([init.method || 'GET', u]);
    const ok = body => ({ ok: true, status: 200, json: async () => body });
    if (u.includes('oauth2.googleapis.com')) return ok({ access_token: 't', expires_in: 3600 });
    if (u.includes('?fields=sheets')) return ok({ sheets: [{ properties: { title: 'Sheet1' } }] });
    if (u.endsWith(':batchUpdate')) return ok({});
    if (u.includes('!A1:A1')) return ok({ values: [['id']] });
    if (u.includes(':append')) { rows.push(JSON.parse(init.body).values[0]); return ok({}); }
    if (u.includes('values/leads!A2:M')) return ok({ values: rows });
    if (u.includes('values/leads!K')) { const m = u.match(/!K(\d+):M/); rows[Number(m[1]) - 2].splice(10, 3, ...JSON.parse(init.body).values[0]); return ok({}); }
    return ok({});
  };
  const store = createSheetsStore({ sheetId: 'abc', serviceAccountJson: { client_email: 'bot@x.iam.gserviceaccount.com', private_key: privateKey }, fetchImpl });
  await store.addLead({ id: 'a1', created_at: '2026-11-21T10:00:00Z', name: '=HYPERLINK("x")', phone: '9876543210', class_band: '5-7', status: 'new', notes: '', updated_at: '' });
  assert.equal(rows[0][2], "'=HYPERLINK(\"x\")"); // formula injection neutralised
  assert.equal((await store.listLeads())[0].phone, '9876543210');
  assert.equal(await store.updateLead('a1', { status: 'hot', notes: 'ok' }), true);
  assert.equal(rows[0][10], 'hot'); assert.equal(await store.updateLead('nope', { status: 'hot' }), false);
  assert.ok(calls.some(([m, u]) => m === 'POST' && u.endsWith(':batchUpdate')), 'creates missing tabs');
});

test('createStore returns null when storage is not configured', () => {
  assert.equal(createStore({}), null);
  assert.equal(createStore({ LOCAL_STORE: '1' }).kind, 'file');
});

// ---- Apps Script backend: run the real Code.gs against a fake Sheets runtime ----
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createAppsScriptStore } from '../lib/store.mjs';

async function fakeAppsScript(token) {
  const sheets = {};
  const makeSheet = name => {
    const rows = []; // rows[0] is the header once written
    return sheets[name] = {
      rows, getLastRow: () => rows.length, setFrozenRows() {},
      getRange(r, c, nr = 1, nc = 1) {
        return {
          setValues(vals) { vals.forEach((v, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; v.forEach((x, j) => { rows[r - 1 + i][c - 1 + j] = x; }); }); return this; },
          setFontWeight() { return this; }, setNumberFormat() { return this; },
          getValues() { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (rows[r - 1 + i] || [])[c - 1 + j] ?? '')); }
        };
      }
    };
  };
  const code = (await readFile(new URL('../apps-script/Code.gs', import.meta.url), 'utf8')).replace("'PASTE_YOUR_TOKEN_HERE';\n\nconst LEAD", `'${token}';\n\nconst LEAD`);
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets[n] || null, insertSheet: n => makeSheet(n) }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    JSON, Date, Math, String, Number
  };
  vm.createContext(ctx); vm.runInContext(code + '\nthis.doPost = doPost; this.doGet = doGet;', ctx);
  return { sheets, fetchImpl: async (url, init) => ({ ok: true, status: 200, json: async () => JSON.parse(ctx.doPost({ postData: { contents: init.body } }).text) }) };
}

test('Apps Script backend: add, dedupe, list, update, events, auth', async () => {
  const fake = await fakeAppsScript('tok123');
  const store = createAppsScriptStore({ url: 'https://script.google.com/x', token: 'tok123', fetchImpl: fake.fetchImpl });
  const lead = { id: 'a1', created_at: new Date().toISOString(), name: '=HYPERLINK("x")', phone: '9876543210', class_band: '5-7', status: 'new', notes: '', updated_at: '' };
  assert.deepEqual(await store.addLeadUnique(lead, 86400000), { duplicate: false });
  assert.deepEqual(await store.addLeadUnique({ ...lead, id: 'a2' }, 86400000), { duplicate: true });
  assert.deepEqual(await store.addLeadUnique({ ...lead, id: 'a3', phone: '9123456789' }, 86400000), { duplicate: false });
  const leads = await store.listLeads();
  assert.equal(leads.length, 2); assert.equal(leads[0].name, '=HYPERLINK("x")'); assert.equal(fake.sheets.leads.rows[0][0], 'id'); // header written
  assert.equal(await store.updateLead('a1', { status: 'hot', notes: 'call 5pm' }), true);
  assert.equal(await store.updateLead('missing', { status: 'hot' }), false);
  const after = (await store.listLeads()).find(l => l.id === 'a1'); assert.equal(after.status, 'hot'); assert.equal(after.notes, 'call 5pm');
  await assert.rejects(store.updateLead('a1', { status: 'rich' }), /bad_status/);
  await store.addEvent({ ts: new Date().toISOString(), type: 'cta', action: 'call', page: '/' });
  assert.equal((await store.listEvents())[0].action, 'call');
  const wrong = createAppsScriptStore({ url: 'u', token: 'bad', fetchImpl: fake.fetchImpl });
  await assert.rejects(wrong.listLeads(), /unauthorized/);
});

test('createStore prefers Apps Script when its settings are present', () => {
  assert.equal(createStore({ APPS_SCRIPT_URL: 'https://x', APPS_SCRIPT_TOKEN: 't' }).kind, 'apps-script');
});
