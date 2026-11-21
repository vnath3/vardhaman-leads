// Storage adapter. Phase 1 uses Google Sheets; a file store is used for local development and tests.
// To move to a real database later, implement the same five methods and change createStore().
import { createSign, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { LEAD_COLUMNS, EVENT_COLUMNS } from './config.mjs';

// Fields the dashboard may change. contacted_at is stamped automatically the first time a lead leaves "new".
export function mergePatch(lead, patch, nowIso = new Date().toISOString()) {
  const next = { ...lead, ...patch, updated_at: nowIso };
  if (patch.status !== undefined && patch.status !== 'lost') next.lost_reason = '';
  if (patch.status !== undefined && patch.status !== 'new' && !lead.contacted_at) next.contacted_at = nowIso;
  return next;
}
const colLetter = n => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const LEAD_LAST_COL = colLetter(LEAD_COLUMNS.length);
const rowToLead = row => Object.fromEntries(LEAD_COLUMNS.map((key, i) => [key, row[i] ?? '']));
const leadToRow = lead => LEAD_COLUMNS.map(key => lead[key] ?? '');
// Sheets would treat a leading = + - @ as a formula when a person edits or exports the sheet; keep them as text.
const safeCell = value => (typeof value === 'string' && /^[=+\-@]/.test(value) ? `'${value}` : value);

export function newLead(value, now = new Date(), consentVersion) {
  const stamp = now.toISOString();
  return { id: randomUUID().slice(0, 8), created_at: stamp, ...value, consent_version: consentVersion, status: 'new', notes: '', updated_at: stamp, area: '', lost_reason: '', contacted_at: '', repeats: '0' };
}

export function createFileStore(dir) {
  const file = name => path.join(dir, name + '.json');
  const read = async name => { try { return JSON.parse(await readFile(file(name), 'utf8')); } catch { return []; } };
  const write = async (name, rows) => { await mkdir(dir, { recursive: true }); await writeFile(file(name), JSON.stringify(rows, null, 1)); };
  return {
    kind: 'file',
    async addLead(lead) { const rows = await read('leads'); rows.push(lead); await write('leads', rows); },
    async addLeadUnique(lead, windowMs) { return uniqueAdd(this, lead, windowMs); },
    async listLeads() { return read('leads'); },
    async updateLead(id, patch) {
      const rows = await read('leads'); const row = rows.find(r => r.id === id);
      if (!row) return false;
      Object.assign(row, mergePatch(row, patch));
      await write('leads', rows); return true;
    },
    async addEvent(event) { const rows = await read('events'); rows.push(event); await write('events', rows.slice(-20000)); },
    async listEvents() { return read('events'); }
  };
}

export function createSheetsStore({ sheetId, serviceAccountJson, fetchImpl = fetch }) {
  const account = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson;
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}`;
  let token = null, tokenExpiry = 0, ready = null;

  async function accessToken() {
    if (token && Date.now() < tokenExpiry - 60000) return token;
    const now = Math.floor(Date.now() / 1000);
    const enc = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key, 'base64url');
    const res = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` })
    });
    if (!res.ok) throw new Error(`Google auth failed (${res.status})`);
    const data = await res.json(); token = data.access_token; tokenExpiry = Date.now() + data.expires_in * 1000;
    return token;
  }
  async function call(url, init = {}) {
    const res = await fetchImpl(url, { ...init, headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json', ...(init.headers || {}) } });
    if (!res.ok) throw new Error(`Sheets request failed (${res.status})`);
    return res.json();
  }
  // Creates the "leads" and "events" tabs and header rows on first use.
  function ensureTabs() {
    ready ||= (async () => {
      const meta = await call(`${base}?fields=sheets.properties.title`);
      const have = new Set(meta.sheets.map(s => s.properties.title));
      const missing = ['leads', 'events'].filter(t => !have.has(t));
      if (missing.length) await call(`${base}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: missing.map(title => ({ addSheet: { properties: { title } } })) }) });
      for (const [tab, columns] of [['leads', LEAD_COLUMNS], ['events', EVENT_COLUMNS]]) {
        const headRow = await call(`${base}/values/${tab}!1:1`);
        if ((headRow.values?.[0]?.length || 0) < columns.length) await call(`${base}/values/${tab}!A1?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values: [columns] }) });
      }
    })().catch(error => { ready = null; throw error; });
    return ready;
  }
  const append = async (tab, row) => {
    await ensureTabs();
    await call(`${base}/values/${tab}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'POST', body: JSON.stringify({ values: [row.map(safeCell)] }) });
  };
  const readAll = async (tab, lastCol) => { await ensureTabs(); return (await call(`${base}/values/${tab}!A2:${lastCol}`)).values || []; };

  return {
    kind: 'sheets',
    async addLead(lead) { await append('leads', leadToRow(lead)); },
    async addLeadUnique(lead, windowMs) { return uniqueAdd(this, lead, windowMs); },
    async listLeads() { return (await readAll('leads', LEAD_LAST_COL)).map(rowToLead); },
    async updateLead(id, patch) {
      const rows = await readAll('leads', LEAD_LAST_COL);
      const index = rows.findIndex(r => r[0] === id);
      if (index < 0) return false;
      const lead = mergePatch(rowToLead(rows[index]), patch);
      const sheetRow = index + 2; // header is row 1
      await call(`${base}/values/leads!A${sheetRow}:${LEAD_LAST_COL}${sheetRow}?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values: [leadToRow(lead).map(safeCell)] }) });
      return true;
    },
    async addEvent(event) { await append('events', EVENT_COLUMNS.map(k => event[k] ?? '')); },
    async listEvents() { return (await readAll('events', 'D')).slice(-20000).map(r => Object.fromEntries(EVENT_COLUMNS.map((k, i) => [k, r[i] ?? '']))); }
  };
}

// Same phone number inside the window counts as a duplicate and is not stored twice.
async function uniqueAdd(store, lead, windowMs) {
  const since = Date.now() - windowMs;
  const existing = (await store.listLeads()).find(l => l.phone === lead.phone && new Date(l.created_at).getTime() > since);
  if (existing) return { duplicate: true, existing };
  await store.addLead(lead);
  return { duplicate: false };
}

// Google Apps Script web app bound to the Sheet (see apps-script/Code.gs). One POST per operation.
export function createAppsScriptStore({ url, token, fetchImpl = fetch, timeoutMs = 9000 }) {
  async function call(action, payload = {}) {
    const res = await fetchImpl(url, {
      method: 'POST', redirect: 'follow', headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ token, action, ...payload }), signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) throw new Error(`Apps Script request failed (${res.status})`);
    const data = await res.json();
    if (!data.ok) throw new Error(`Apps Script error: ${data.error || 'unknown'}`);
    return data;
  }
  return {
    kind: 'apps-script',
    async addLead(lead) { await call('addLead', { lead }); },
    async addLeadUnique(lead, windowMs) { const r = await call('addLead', { lead, windowMs }); return r.duplicate ? { duplicate: true, existing: Array.isArray(r.existing) ? rowToLead(r.existing) : null } : { duplicate: false }; },
    async listLeads() { return (await call('listLeads')).rows.map(rowToLead); },
    async updateLead(id, patch) { return Boolean((await call('updateLead', { id, patch })).found); },
    async addEvent(event) { await call('addEvent', { event }); },
    async listEvents() { return (await call('listEvents')).rows.map(r => Object.fromEntries(EVENT_COLUMNS.map((k, i) => [k, r[i] ?? '']))); }
  };
}

export function createStore(env = process.env) {
  if (env.APPS_SCRIPT_URL && env.APPS_SCRIPT_TOKEN) return createAppsScriptStore({ url: env.APPS_SCRIPT_URL, token: env.APPS_SCRIPT_TOKEN });
  if (env.GOOGLE_SHEET_ID && env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return createSheetsStore({ sheetId: env.GOOGLE_SHEET_ID, serviceAccountJson: env.GOOGLE_SERVICE_ACCOUNT_JSON });
  }
  if (env.LOCAL_STORE === '1') return createFileStore(env.LOCAL_STORE_DIR || '.data');
  return null; // not configured: handlers answer 503 instead of silently dropping leads
}
