import { CLASS_BANDS, STATUSES, EVENT_TYPES, CTA_ACTIONS } from './config.mjs';

const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function normalizePhone(raw) {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export function validateLead(input) {
  const errors = {};
  const body = input && typeof input === 'object' ? input : {};
  const name = clean(body.name, 60);
  if (name.length < 2) errors.name = 'Please enter the parent\'s name.';
  const phone = normalizePhone(body.phone);
  if (!phone) errors.phone = 'Please enter a valid 10-digit mobile number.';
  const class_band = String(body.class_band ?? '');
  if (!CLASS_BANDS.includes(class_band)) errors.class_band = 'Please choose a class.';
  const bot = clean(body.website, 100).length > 0; // honeypot: humans never fill this
  if (Object.keys(errors).length) return { ok: false, errors, bot };
  return {
    ok: true, bot,
    value: {
      name, phone, class_band,
      source: clean(body.source, 200),
      utm_source: clean(body.utm_source, 80),
      utm_medium: clean(body.utm_medium, 80),
      utm_campaign: clean(body.utm_campaign, 80)
    }
  };
}

export function validateEvent(input) {
  const body = input && typeof input === 'object' ? input : {};
  const type = String(body.type ?? '');
  if (!EVENT_TYPES.includes(type)) return { ok: false };
  const action = type === 'cta' ? String(body.action ?? '') : '';
  if (type === 'cta' && !CTA_ACTIONS.includes(action)) return { ok: false };
  return { ok: true, value: { type, action, page: clean(body.page, 200) } };
}

export function validateStatusUpdate(input) {
  const body = input && typeof input === 'object' ? input : {};
  const id = clean(body.id, 40);
  if (!id) return { ok: false };
  const patch = {};
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return { ok: false };
    patch.status = body.status;
  }
  if (body.notes !== undefined) patch.notes = clean(body.notes, 500);
  return Object.keys(patch).length ? { ok: true, id, patch } : { ok: false };
}
