// Zero-dependency static dev server with live reload.
// Usage: node dev-server.mjs [port]
// Serves this folder on localhost and the LAN (so you can open it on a phone),
// and reloads any open tab whenever a file changes.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';

const ROOT = process.cwd();
const PORT = Number(process.argv[2]) || 4173;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
};

// Injected into HTML responses only — index.html on disk is never modified.
const RELOAD_SNIPPET = `<script>(()=>{const s=new EventSource("/__reload");s.onmessage=()=>location.reload();})()</script>`;

const clients = new Set();

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (pathname === '/__reload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  // Dev-only stand-ins for the lead-magnet signup and its optional qualifier answers.
  // Production will be Vercel functions that talk to Kit. `fail@example.com` returns
  // 500 to test the error state.
  if (pathname === '/api/subscribe' || pathname === '/api/qualify') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' }).end('{"ok":false}');
      return;
    }
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 10_000) break;
    }
    let payload;
    try { payload = JSON.parse(raw); } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' }).end('{"ok":false}');
      return;
    }
    const failed = payload?.email === 'fail@example.com';
    console.log(`  ✉ ${pathname.slice(5)} ${failed ? '(forced failure) ' : ''}${JSON.stringify(payload)}`);
    res.writeHead(failed ? 500 : 200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ ok: !failed }));
    return;
  }

  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  // Never serve dotfiles — .env.local holds a token and must not leak onto the LAN.
  if (rel.split(/[/\\]/).some(part => part.startsWith('.') && part.length > 1)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' }).end('403 forbidden');
    return;
  }

  let file = join(ROOT, rel);
  if (!file.startsWith(ROOT + sep) && file !== ROOT) {
    res.writeHead(403, { 'Content-Type': 'text/plain' }).end('403 forbidden');
    return;
  }

  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const ext = extname(file).toLowerCase();
    let body = await readFile(file);
    if (ext === '.html') {
      body = Buffer.from(body.toString().replace('</body>', `${RELOAD_SNIPPET}</body>`));
    }
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404 not found');
  }
});

const IGNORED = /^(\.git|\.context|\.superpowers|node_modules|docs|tests)/;
let timer;
watch(ROOT, { recursive: true }, (_event, filename) => {
  if (!filename || IGNORED.test(filename)) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    for (const c of clients) c.write('data: reload\n\n');
    console.log(`  ↻ ${filename} — reloaded ${clients.size} tab(s)`);
  }, 80);
});

const lanIp = Object.values(networkInterfaces())
  .flat()
  .find(i => i && i.family === 'IPv4' && !i.internal)?.address;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Creator Lab dev server — live reload on\n`);
  console.log(`  Desktop:  http://localhost:${PORT}/`);
  if (lanIp) console.log(`  Phone:    http://${lanIp}:${PORT}/   (same Wi-Fi)`);
  console.log(`\n  Watching for changes. Ctrl+C to stop.\n`);
});
