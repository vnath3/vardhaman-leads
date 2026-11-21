// Writes clearly fictional demo leads into a local test store (never used in production).
import { createFileStore } from '../lib/store.mjs';
const store = createFileStore(process.argv[2] || '.data');
const names = ['Anjali Deshmukh', 'Rahul Patil', 'Sneha Joshi', 'Vikram Kale', 'Pooja Shinde', 'Amit Jadhav', 'Neha Kulkarni', 'Sanjay More', 'Kavita Pawar', 'Rohit Gaikwad', 'Meera Bhosale', 'Nitin Salunke'];
const statuses = ['new', 'new', 'hot', 'contacted', 'demo_booked', 'new', 'lost', 'contacted', 'hot', 'enrolled', 'new', 'contacted'];
const bands = ['5-7', '1-4', '8-10', '5-7', '8-10', '1-4', '5-7', '8-10', '1-4', '8-10', '5-7', '1-4'];
const sources = ['google', '/classes-8-10/', 'whatsapp', '/', '/tuition-bansilal-nagar/', 'google', '/demo-class/', 'google', '/', '/classes-5-7/', 'whatsapp', '/classes-1-4/'];
const now = Date.now();
for (let i = 0; i < names.length; i++) {
  const t = new Date(now - (i * 2.3 + 0.3) * 3600000 * (i > 5 ? 9 : 1)).toISOString();
  await store.addLead({ id: 'd' + i.toString().padStart(3, '0'), created_at: t, name: names[i], phone: '98' + String(70000000 + i * 1371).padStart(8, '0'), class_band: bands[i], source: sources[i], utm_source: sources[i][0] === '/' ? '' : sources[i], utm_medium: '', utm_campaign: '', consent_version: '2026-11-21', status: statuses[i], notes: i === 2 ? 'Wants Maths + Science. Call after 5 pm.' : '', updated_at: t,
    city: i % 3 === 0 ? 'Pune' : 'Chhatrapati Sambhajinagar', region: 'Maharashtra', device: i % 4 === 3 ? 'desktop' : 'mobile', trigger: ['button', 'auto-scroll', 'auto-exit'][i % 3], area: i % 2 ? 'Bansilal Nagar' : '',
    lost_reason: statuses[i] === 'lost' ? 'price' : '', contacted_at: statuses[i] === 'new' ? '' : new Date(new Date(t).getTime() + (i + 1) * 9 * 60000).toISOString(), repeats: i === 4 ? '2' : '0' });
}
for (let d = 0; d < 28; d++) for (let k = 0; k < (d % 4) + 3; k++) {
  const ts = new Date(now - d * 86400000 - k * 3600000).toISOString();
  await store.addEvent({ ts, type: 'form_view', action: ['button', 'auto-scroll', 'auto-exit'][k % 3], page: '/' });
  if (k % 2 === 0) await store.addEvent({ ts, type: 'cta', action: ['whatsapp', 'call', 'map'][k % 3], page: '/' });
}
console.log('seeded');
