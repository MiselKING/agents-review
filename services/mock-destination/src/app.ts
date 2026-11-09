import { createServer, type ServerResponse } from 'node:http';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** The fake ad platform. Only a health check for now. */
export function createApp() {
  return createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }
    sendJson(res, 404, { error: 'not found' });
  });
}
