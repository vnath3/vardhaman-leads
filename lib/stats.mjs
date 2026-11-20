import { STATUSES, CLASS_BANDS, CTA_ACTIONS, IST_OFFSET_MIN } from './config.mjs';

// All day buckets use India time so "today" matches what Rushabh Sir sees on his phone.
export const istDay = (isoOrDate) => new Date(new Date(isoOrDate).getTime() + IST_OFFSET_MIN * 60000).toISOString().slice(0, 10);

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
  const rate = formViews7 > 0 ? Math.round((leads7 / formViews7) * 1000) / 10 : null;
  return {
    totals: { all: leads.length, today: todayCount, week, hot: byStatus.hot, demo_booked: byStatus.demo_booked, enrolled: byStatus.enrolled },
    byStatus, byClass,
    bySource: Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 8),
    perDay: dayKeys.map(day => ({ day, leads: byDay[day] })),
    funnel: { formViews, formViews7, leads7, conversionPct7: rate },
    ctaByAction
  };
}
