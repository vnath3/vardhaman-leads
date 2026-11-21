/**
 * Vardhaman Academy leads: Google Apps Script storage backend.
 * Bound to the Google Sheet that holds the data. Deploy as a Web app:
 *   Execute as: Me   |   Who has access: Anyone
 * Every request must carry the shared TOKEN, so the address alone is useless to others.
 */
const TOKEN = 'PASTE_YOUR_TOKEN_HERE';

const LEAD_COLUMNS = ['id', 'created_at', 'name', 'phone', 'class_band', 'source', 'utm_source', 'utm_medium', 'utm_campaign', 'consent_version', 'status', 'notes', 'updated_at',
  'city', 'region', 'device', 'trigger', 'area', 'lost_reason', 'contacted_at', 'repeats']; // keep in sync with lib/config.mjs
const EVENT_COLUMNS = ['ts', 'type', 'action', 'page'];
const STATUSES = ['new', 'contacted', 'hot', 'demo_booked', 'enrolled', 'lost'];
const MAX_ROWS = 5000;

function doGet() { return out({ ok: true, service: 'vardhaman-leads' }); }

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (!TOKEN || TOKEN === 'PASTE_YOUR_TOKEN_HERE' || body.token !== TOKEN) return out({ ok: false, error: 'unauthorized' });
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try { return out(handle(body)); } finally { lock.releaseLock(); }
  } catch (err) {
    return out({ ok: false, error: String((err && err.message) || err) });
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function tab(name, columns) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, columns.length).setValues([columns]).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else if (sh.getLastColumn() < columns.length) { // columns were added in a newer version: extend the header row
    sh.getRange(1, 1, 1, columns.length).setValues([columns]).setFontWeight('bold');
  }
  return sh;
}

// Text format on every written row, so Sheets never turns a value into a formula, number or date.
function appendRow(sh, columns, record) {
  const row = columns.map(function (c) { return record[c] === undefined || record[c] === null ? '' : String(record[c]); });
  const at = sh.getLastRow() + 1;
  sh.getRange(at, 1, 1, columns.length).setNumberFormat('@').setValues([row]);
}

function readRows(sh, columns) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  const first = Math.max(2, last - MAX_ROWS + 1);
  return sh.getRange(first, 1, last - first + 1, columns.length).getValues().map(function (r) {
    return r.map(function (v) { return v === null || v === undefined ? '' : String(v); });
  });
}

function handle(body) {
  const action = body.action;
  if (action === 'addLead') {
    const sh = tab('leads', LEAD_COLUMNS);
    const lead = body.lead || {};
    if (body.windowMs) { // reject the same phone number inside the window
      const since = Date.now() - Number(body.windowMs);
      const recent = readRows(sh, LEAD_COLUMNS).slice(-300);
      for (var i = 0; i < recent.length; i++) {
        if (recent[i][3] === String(lead.phone) && new Date(recent[i][1]).getTime() > since) return { ok: true, duplicate: true, existing: recent[i] };
      }
    }
    appendRow(sh, LEAD_COLUMNS, lead);
    return { ok: true, duplicate: false };
  }
  if (action === 'listLeads') return { ok: true, rows: readRows(tab('leads', LEAD_COLUMNS), LEAD_COLUMNS) };
  if (action === 'updateLead') {
    const sh = tab('leads', LEAD_COLUMNS);
    const patch = body.patch || {};
    if (patch.status !== undefined && STATUSES.indexOf(patch.status) < 0) return { ok: false, error: 'bad_status' };
    const last = sh.getLastRow();
    if (last < 2) return { ok: true, found: false };
    const ids = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var r = 0; r < ids.length; r++) {
      if (String(ids[r][0]) === String(body.id)) {
        const rowNum = r + 2, now = new Date().toISOString();
        const row = sh.getRange(rowNum, 1, 1, LEAD_COLUMNS.length).getValues()[0].map(String);
        const cur = {}; LEAD_COLUMNS.forEach(function (c, k) { cur[c] = row[k] === undefined ? '' : row[k]; });
        if (patch.notes !== undefined) cur.notes = String(patch.notes).slice(0, 500);
        if (patch.area !== undefined) cur.area = String(patch.area).slice(0, 60);
        if (patch.lost_reason !== undefined) cur.lost_reason = String(patch.lost_reason).slice(0, 40);
        if (patch.repeats !== undefined) cur.repeats = String(patch.repeats).slice(0, 6);
        if (patch.status !== undefined) {
          cur.status = patch.status;
          if (patch.status !== 'lost' && patch.lost_reason === undefined) cur.lost_reason = '';
          if (patch.status !== 'new' && !cur.contacted_at) cur.contacted_at = now; // first time anyone acted on the lead
        }
        cur.updated_at = now;
        sh.getRange(rowNum, 1, 1, LEAD_COLUMNS.length).setNumberFormat('@').setValues([LEAD_COLUMNS.map(function (c) { return cur[c]; })]);
        return { ok: true, found: true };
      }
    }
    return { ok: true, found: false };
  }
  if (action === 'addEvent') {
    appendRow(tab('events', EVENT_COLUMNS), EVENT_COLUMNS, body.event || {});
    return { ok: true };
  }
  if (action === 'listEvents') return { ok: true, rows: readRows(tab('events', EVENT_COLUMNS), EVENT_COLUMNS) };
  return { ok: false, error: 'unknown_action' };
}
