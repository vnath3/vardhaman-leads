/* Vardhaman Academy one-step lead form.
   Usage:  <div id="va-lead"></div>
           <script src="lead.js" data-api="https://your-leads-site" data-whatsapp="91XXXXXXXXXX" data-consent-url="./consent/" defer></script>
   Collects only: parent's name, mobile number, class. No cookies. Tracks anonymous form views and call/WhatsApp/map taps. */
(function () {
  var script = document.currentScript;
  var cfg = {
    api: (script && script.getAttribute('data-api')) || '',
    whatsapp: (script && script.getAttribute('data-whatsapp')) || '',
    consent: (script && script.getAttribute('data-consent-url')) || '',
    title: (script && script.getAttribute('data-title')) || 'Get a call back',
    sub: (script && script.getAttribute('data-sub')) || 'Share your number and Rushabh Sir will call you.'
  };
  var CSS = '.val-box{font-family:inherit;max-width:440px;margin:0 auto;background:#fff;border:1px solid #d5e5e9;border-radius:18px;padding:22px;box-shadow:0 10px 30px rgba(20,59,80,.08);color:#17323c}' +
    '.val-box h3{margin:0 0 4px;font:800 22px/1.2 Outfit,system-ui,sans-serif}.val-box p{margin:0 0 14px;color:#456067;font-size:15px;line-height:1.45}' +
    '.val-box label,.val-box legend{display:block;font-weight:700;font-size:14px;margin:12px 0 6px;padding:0}.val-box fieldset{border:0;margin:0;padding:0}' +
    '.val-box input[type=text],.val-box input[type=tel]{width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:13px 14px;border:1.5px solid #c9dbe0;border-radius:12px;background:#fff}' +
    '.val-box input:focus{outline:3px solid #bfe3f0;border-color:#167da5}.val-phone{display:flex;gap:8px}.val-phone span{display:flex;align-items:center;padding:0 12px;border:1.5px solid #c9dbe0;border-radius:12px;background:#f3f8fa;font-weight:700}' +
    '.val-pills{display:flex;gap:8px}.val-pills label{flex:1;margin:0;font-weight:700}.val-pills input{position:absolute;opacity:0;pointer-events:none}' +
    '.val-pills span{display:block;text-align:center;padding:12px 0;border:1.5px solid #c9dbe0;border-radius:12px;cursor:pointer;background:#fff}.val-pills input:checked+span{background:#167da5;border-color:#167da5;color:#fff}' +
    '.val-pills input:focus-visible+span{outline:3px solid #bfe3f0}.val-btn{width:100%;margin-top:16px;padding:15px;border:0;border-radius:999px;background:#167da5;color:#fff;font:800 17px inherit;font-family:inherit;cursor:pointer}' +
    '.val-btn[disabled]{opacity:.6;cursor:wait}.val-note{margin:12px 0 0!important;font-size:12.5px!important;color:#5b6f77!important}.val-note a{color:#167da5}' +
    '.val-err{color:#b3261e;font-size:13.5px;margin:6px 0 0;min-height:0}.val-hp{position:absolute!important;left:-9999px!important;height:0;width:0;opacity:0}' +
    '.val-thanks{text-align:center;padding:10px 0}.val-thanks strong{display:block;font:800 22px Outfit,system-ui,sans-serif;margin-bottom:6px}.val-wa{display:inline-block;margin-top:12px;padding:12px 20px;border-radius:999px;border:1.5px solid #167da5;color:#167da5;font-weight:800;text-decoration:none}';

  function send(path, body) {
    var url = cfg.api + path, data = JSON.stringify(body);
    try { if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([data], { type: 'text/plain' }))) return; } catch (e) {}
    try { fetch(url, { method: 'POST', body: data, keepalive: true, headers: { 'content-type': 'text/plain' } }); } catch (e) {}
  }
  function track(type, action) { send('/api/event', { type: type, action: action || '', page: location.pathname }); }

  function mount(host) {
    var style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    host.innerHTML = '<div class="val-box"><form novalidate><h3></h3><p class="val-sub"></p>' +
      '<label for="val-name">Parent\'s name</label><input id="val-name" name="name" type="text" autocomplete="name" maxlength="60">' +
      '<label for="val-phone">Mobile number</label><div class="val-phone"><span>+91</span><input id="val-phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="12"></div>' +
      '<fieldset><legend>Child\'s class</legend><div class="val-pills">' +
      ['1-4|1–4', '5-7|5–7', '8-10|8–10'].map(function (o) { var p = o.split('|'); return '<label><input type="radio" name="class_band" value="' + p[0] + '"><span>' + p[1] + '</span></label>'; }).join('') +
      '</div></fieldset><input class="val-hp" name="website" type="text" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<p class="val-err" role="alert" aria-live="polite"></p><button class="val-btn" type="submit">Call me back</button>' +
      '<p class="val-note">By tapping, you agree to be contacted by Vardhaman Academy about tuition. We never share your number.' + (cfg.consent ? ' <a href="' + cfg.consent + '">Consent &amp; privacy</a>' : '') + '</p></form>' +
      '<div class="val-thanks" hidden><strong>Thank you!</strong><span>We have your number and will call you soon.</span></div></div>';
    host.querySelector('h3').textContent = cfg.title; host.querySelector('.val-sub').textContent = cfg.sub;
    var form = host.querySelector('form'), err = host.querySelector('.val-err'), btn = host.querySelector('.val-btn'), thanks = host.querySelector('.val-thanks');
    var params = new URLSearchParams(location.search);

    form.addEventListener('submit', function (e) {
      e.preventDefault(); err.textContent = '';
      var f = form.elements, picked = form.querySelector('input[name=class_band]:checked');
      var body = { name: f.name.value, phone: f.phone.value, class_band: picked ? picked.value : '', website: f.website.value,
        source: location.pathname, utm_source: params.get('utm_source') || (document.referrer ? new URL(document.referrer).hostname : ''), utm_medium: params.get('utm_medium') || '', utm_campaign: params.get('utm_campaign') || '' };
      if (body.name.trim().length < 2) { err.textContent = 'Please enter the parent\'s name.'; f.name.focus(); return; }
      if (!/^(?:\+?91|0)?[6-9]\d{9}$/.test(body.phone.replace(/[\s-]/g, ''))) { err.textContent = 'Please enter a valid 10-digit mobile number.'; f.phone.focus(); return; }
      if (!picked) { err.textContent = 'Please choose your child\'s class.'; return; }
      btn.disabled = true; btn.textContent = 'Sending…';
      fetch(cfg.api + '/api/lead', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (res) { if (!res.ok) throw new Error(String(res.status)); form.hidden = true; thanks.hidden = false;
          if (cfg.whatsapp) { var a = document.createElement('a'); a.className = 'val-wa'; a.href = 'https://wa.me/' + cfg.whatsapp + '?text=' + encodeURIComponent('Hi, I just asked for a call back about tuition.'); a.textContent = 'Or message us on WhatsApp'; thanks.appendChild(document.createElement('br')); thanks.appendChild(a); }
          thanks.setAttribute('tabindex', '-1'); thanks.focus(); })
        .catch(function () { err.textContent = 'Could not send. Please try again' + (cfg.whatsapp ? ' or message us on WhatsApp.' : '.'); btn.disabled = false; btn.textContent = 'Call me back'; });
    });

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) { if (entries[0].isIntersecting) { io.disconnect(); track('form_view'); } }, { threshold: 0.5 });
      io.observe(host);
    }
  }

  document.addEventListener('click', function (ev) {
    var el = ev.target && ev.target.closest ? ev.target.closest('a') : null; if (!el) return;
    var href = el.getAttribute('href') || '';
    if (/wa\.me|whatsapp/i.test(href)) track('cta', 'whatsapp'); else if (/^tel:/i.test(href)) track('cta', 'call'); else if (/maps/i.test(href)) track('cta', 'map');
  }, true);

  function init() { var host = document.getElementById('va-lead'); if (host) mount(host); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
