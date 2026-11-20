// Shared constants. Keep this file the single source of truth for allowed values.
export const STATUSES = ['new', 'contacted', 'hot', 'demo_booked', 'enrolled', 'lost'];
export const STATUS_LABELS = {
  new: 'New', contacted: 'Contacted', hot: 'Hot', demo_booked: 'Demo booked', enrolled: 'Enrolled', lost: 'Lost'
};
export const CLASS_BANDS = ['1-4', '5-7', '8-10'];
export const CONSENT_VERSION = '2026-11-21';
export const EVENT_TYPES = ['form_view', 'cta'];
export const CTA_ACTIONS = ['whatsapp', 'call', 'map', 'enquiry_button', 'enquiry_bar'];
export const LEAD_COLUMNS = ['id', 'created_at', 'name', 'phone', 'class_band', 'source', 'utm_source', 'utm_medium', 'utm_campaign', 'consent_version', 'status', 'notes', 'updated_at'];
export const EVENT_COLUMNS = ['ts', 'type', 'action', 'page'];
export const IST_OFFSET_MIN = 330;
