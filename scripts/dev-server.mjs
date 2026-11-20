// Local development server: serves ./public and routes /api/* to the same handlers Netlify runs.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleLead, handleEvent, handleAdmin } from '../lib/handlers.mjs';
import { createStore } from '../lib/store.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const port = Number(process.env.PORT || 8888);
const env = { LOCAL_STORE: '1', ...process.env };
const store = createStore(env);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
      const request = new Request(url, { method: req.method, headers: req.headers, body });
      const handler = url.pathname.startsWith('/api/admin') ? handleAdmin : url.pathname === '/api/lead' ? handleLead : url.pathname === '/api/event' ? handleEvent : null;
      const response = handler ? await handler(request, { store, env }) : new Response('Not found', { status: 404 });
      const headers = {}; response.headers.forEach((v, k) => { headers[k] = v; });
      const cookies = response.headers.getSetCookie?.() || []; if (cookies.length) headers['set-cookie'] = cookies;
      res.writeHead(response.status, headers); res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, () => console.log(`http://localhost:${port}  (store: ${store?.kind || 'NOT CONFIGURED'})`));
