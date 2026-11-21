import { STATUSES, CLASS_BANDS, CTA_ACTIONS, IST_OFFSET_MIN, LOST_REASONS, TRIGGERS, STALE_HOURS } from './config.mjs';

// All day buckets use India time so "today" matches what Rushabh Sir sees on his phone.
export const istDay = (isoOrDate) => new Date(new Date(isoOrDate).getTime() + IST_OFFSET_MIN * 60000).toISOString().slice(0, 10);

export const istTime = (isoOrDate) => new Date(new Date(isoOrDate).getTime() + IST_OFFSET_MIN * 60000).toISOString().slice(5, 16).replace('T', ' ');

export function summarize(leads, events, now = new Date(), days = 30) {
  const today = istDay(now);
  const dayKeys = Array.from({ length: days }, (_, i) => istDay(new Date(now.getTime() - (days - 1 - i) * 86400000)));
  const inRange = new Set(dayKeys);
  const zero = () => Object.fromEntries(dayKeys.map(k => [k, 0]));

  const byDay = zero(), byStatus = Object.fromEntries(STATUSES.map(s => [s, 0])), byClass = Object.fromEntries(CLASS_BANDS.map(c => [c, 0]));
  const bySource = {};
  let todayCount = 0, week = 0;
  const weekKeys = new Set(dayKeys.slice(-7));
  for (const lead of leads) {
    const day = istDay(lead.created_at);
    if (byStatus[lead.status] !== undefined) byStatus[lead.status]++;
    if (!inRange.has(day)) continue;
    byDay[day]++;
    if (day === today) todayCount++;
    if (weekKeys.has(day)) week++;
    if (byClass[lead.class_band] !== undefined) byClass[lead.class_band]++;
    const source = lead.utm_source || (lead.source ? lead.source.split('?')[0] : '') || 'direct';
    bySource[source] = (bySource[source] || 0) + 1;
  }
  const ctaByAction = Object.fromEntries(CTA_ACTIONS.map(a => [a, 0]));
  let formViews = 0, formViews7 = 0, leads7 = week;
  for (const event of events) {
    const day = istDay(event.ts);
    if (!inRange.has(day)) continue;
    if (event.type === 'form_view') { formViews++; if (weekKeys.has(day)) formViews7++; }
    if (event.type === 'cta' && ctaByAction[event.action] !== undefined) ctaByAction[event.action]++;
  }
  // How parents arrive at the popup and how many then leave their number, per trigger.
  const opens = Object.fromEntries(TRIGGERS.map(t => [t, 0])), leadsBy = Object.fromEntries(TRIGGERS.map(t => [t, 0]));
  for (const event of events) if (event.type === 'form_view' && opens[event.action] !== undefined && inRange.has(istDay(event.ts))) opens[event.action]++;
  const byDevice = {}, byCity = {}, lostReasons = Object.fromEntries(Object.keys(LOST_REASONS).map(k => [k, 0]));
  for (const lead of leads) {
    if (inRange.has(istDay(lead.created_at))) {
      if (leadsBy[lead.trigger] !== undefined) leadsBy[lead.trigger]++;
      const device = lead.device || 'unknown'; byDevice[device] = (byDevice[device] || 0) + 1;
      const city = [lead.city, lead.region].filter(Boolean).join(', ') || 'Unknown'; byCity[city] = (byCity[city] || 0) + 1;
    }
    if (lead.status === 'lost' && lostReasons[lead.lost_reason] !== undefined) lostReasons[lead.lost_reason]++;
  }
  // Speed to first contact: the number that matters most for a local service.
  const nowMs = now.getTime(), inWindow = leads.filter(l => inRange.has(istDay(l.created_at)));
  const minutes = inWindow.filter(l => l.contacted_at).map(l => Math.max(0, (new Date(l.contacted_at) - new Date(l.created_at)) / 60000)).sort((a, b) => a - b);
  const eligible = inWindow.filter(l => l.contacted_at || nowMs - new Date(l.created_at) > 3600000);
  const fast = eligible.filter(l => l.contacted_at && (new Date(l.contacted_at) - new Date(l.created_at)) <= 3600000).length;
  const response = {
    contacted: minutes.length,
    medianMin: minutes.length ? Math.round(minutes[Math.floor((minutes.length - 1) / 2)]) : null,
    within1hPct: eligible.length ? Math.round((fast / eligible.length) * 1000) / 10 : null,
    waiting: leads.filter(l => l.status === 'new').length,
    stale: leads.filter(l => l.status === 'new' && nowMs - new Date(l.created_at) > STALE_HOURS * 3600000).length
  };
  const rate = formViews7 > 0 ? Math.round((leads7 / formViews7) * 1000) / 10 : null;
  return {
    totals: { all: leads.length, today: todayCount, week, hot: byStatus.hot, demo_booked: byStatus.demo_booked, enrolled: byStatus.enrolled },
    byStatus, byClass,
    bySource: Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 8),
    perDay: dayKeys.map(day => ({ day, leads: byDay[day] })),
    funnel: { formViews, formViews7, leads7, conversionPct7: rate },
    ctaByAction,
    response, lostReasons,
    byTrigger: TRIGGERS.map(t => ({ trigger: t, opens: opens[t], leads: leadsBy[t], pct: opens[t] ? Math.round((leadsBy[t] / opens[t]) * 1000) / 10 : null })),
    byDevice: Object.entries(byDevice).sort((a, b) => b[1] - a[1]),
    byCity: Object.entries(byCity).sort((a, b) => b[1] - a[1]).slice(0, 6)
  };
}
