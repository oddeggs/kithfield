// The web app's development front door: one origin, as when hosted (`<host>/app` beside
// `<host>/api`). Requests and sockets under `/api` go to `wrangler dev`; everything else goes to
// the Expo dev server. Development only; nothing here ships.
//
//   node web/dev-proxy.mjs --port 8190 --app http://localhost:8191 --api http://localhost:8871
//
// Better Auth trusts only its own host's origin, so requests forwarded to the API carry that
// origin (`--trust`, the dev host by default), as the hosted app's requests do.
import http from 'node:http';
import net from 'node:net';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '8190' },
    app: { type: 'string', default: 'http://localhost:8081' },
    api: { type: 'string', default: 'http://localhost:8787' },
    trust: { type: 'string', default: 'https://dev.kithfield.com' },
  },
});

const app = new URL(values.app);
const api = new URL(values.api);
const isApi = (url = '') => url === '/api' || url.startsWith('/api/');
const target = (url) => (isApi(url) ? api : app);

function forwardHeaders(req, to) {
  const headers = { ...req.headers, host: to.host };
  if (isApi(req.url) && headers.origin) headers.origin = values.trust;
  return headers;
}

const server = http.createServer((req, res) => {
  const to = target(req.url);
  const upstream = http.request(
    {
      host: to.hostname,
      port: to.port,
      method: req.method,
      path: req.url,
      headers: forwardHeaders(req, to),
    },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(upstream);
});

// Sockets (the farm, the cottage, Metro's hot reload) are passed through byte for byte.
server.on('upgrade', (req, client, head) => {
  const to = target(req.url);
  const upstream = net.connect(Number(to.port), to.hostname, () => {
    const headers = forwardHeaders(req, to);
    const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (const [name, value] of Object.entries(headers)) {
      for (const one of Array.isArray(value) ? value : [value]) lines.push(`${name}: ${one}`);
    }
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head.length > 0) upstream.write(head);
    upstream.pipe(client);
    client.pipe(upstream);
  });
  const close = () => {
    upstream.destroy();
    client.destroy();
  };
  upstream.on('error', close);
  client.on('error', close);
});

server.listen(Number(values.port), () => {
  console.log(
    `web dev proxy on http://localhost:${values.port} (app ${app.href}, api ${api.href})`,
  );
});
