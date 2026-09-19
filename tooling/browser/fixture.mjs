import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

const file = Buffer.alloc(8 * 1024 * 1024, 0x44);
const sha256 = createHash('sha256').update(file).digest('hex');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Download It browser tests</title>
<style>body{font:16px/1.6 system-ui;max-width:760px;margin:48px auto}li{margin:12px 0}code{overflow-wrap:anywhere}</style>
<h1>Download It browser tests</h1><p>Enable automatic capture with Download It running, then try these downloads. Turn capture off or close the app to check browser fallback.</p>
<ul><li><a href="/file">Direct file (8 MiB, throttled, supports ranges)</a></li>
<li><a href="/redirect">Redirect to the same file</a></li>
<li><a href="/expired">Expired link (403)</a></li>
<li><a href="/login">Login-page response (must stay in browser)</a></li>
<li><a href="/unverified">File without validators (must stay in browser)</a></li>
<li><form action="/post" method="post"><button>POST download (must stay in browser)</button></form></li>
<li><button id="blob">Browser-generated blob (must stay in browser)</button></li></ul>
<p>Expected file SHA-256: <code>${sha256}</code></p>
<script>document.getElementById('blob').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['Browser-only file']));a.download='browser-only.txt';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}</script></html>`;

const server = createServer((request, response) => {
  if (request.url === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(html);
    return;
  }
  if (request.url === '/redirect') {
    response.writeHead(302, { Location: '/file' });
    response.end();
    return;
  }
  if (request.url === '/expired') {
    response.writeHead(403);
    response.end('Expired link');
    return;
  }
  if (request.url === '/login') {
    response.writeHead(200, {
      'Content-Type': 'text/html',
      'Content-Disposition': 'attachment; filename="login.html"',
    });
    response.end('<h1>Sign in required</h1>');
    return;
  }
  if (!['/file', '/post', '/unverified'].includes(request.url)) {
    response.writeHead(404);
    response.end();
    return;
  }
  if (request.url === '/post' && request.method !== 'POST') {
    response.writeHead(405);
    response.end();
    return;
  }
  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? '');
  let start = range ? Number(range[1]) : 0;
  const end = range?.[2] ? Math.min(Number(range[2]), file.length - 1) : file.length - 1;
  if (start > end || start >= file.length) {
    response.writeHead(416, { 'Content-Range': `bytes */${file.length}` });
    response.end();
    return;
  }
  const headers = {
    'Content-Type': 'application/octet-stream',
    'Content-Length': end - start + 1,
    'Content-Disposition': 'attachment; filename="download-it-fixture.bin"',
    'Accept-Ranges': 'bytes',
  };
  if (request.url !== '/unverified') {
    headers.ETag = '"download-it-fixture-v1"';
    headers['Last-Modified'] = 'Sat, 19 Sep 2026 00:00:00 GMT';
  }
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${file.length}`;
  response.writeHead(range ? 206 : 200, headers);
  let waitingForDrain = false;
  response.on('drain', () => {
    waitingForDrain = false;
  });
  const timer = setInterval(() => {
    if (waitingForDrain) return;
    const next = Math.min(start + 64 * 1024, end + 1);
    const ready = response.write(file.subarray(start, next));
    start = next;
    if (start > end) {
      clearInterval(timer);
      response.end();
    } else if (!ready) {
      waitingForDrain = true;
    }
  }, 80);
  response.on('close', () => clearInterval(timer));
});
server.listen(8765, '127.0.0.1', () =>
  console.log(`Browser fixture: http://127.0.0.1:8765\nSHA-256: ${sha256}`),
);
