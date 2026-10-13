import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Native Node.js Zero-Leak Real-Time Room Server (SSE + REST)
 * Works out-of-the-box with Node 22+ with zero external npm dependencies required!
 *
 * Security Fix (Spyfall.co Loopholes #1 & #2):
 * 1. Unauthenticated clients can NEVER delete a room via "Back" button.
 * 2. Secret role/isSpy/location data is strictly isolated per-player via their secretToken
 *    and is NEVER broadcast in public room state!
 */

const rooms = new Map(); // roomId -> { publicState, rolesByToken: Map<secretToken, privateRole>, hostToken, clients: Set<res> }

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
}

function broadcastRoom(roomId) {
  const entry = rooms.get(roomId);
  if (!entry) return;
  for (const client of entry.clients) {
    const privateRole = entry.rolesByToken[client.secretToken] || null;
    const payload = JSON.stringify({
      roomState: entry.publicState,
      privateRole,
    });
    client.res.write(`data: ${payload}\n\n`);
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/api/health') {
    return sendJson(res, 200, {
      status: 'ok',
      game: 'CIRCLE OF SHAQ',
      tagline: "Rise and shine, it's dhokha time…",
      activeRooms: rooms.size,
    });
  }

  // SSE stream for real-time room sync: GET /api/rooms/:roomId/stream?token=...
  const streamMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{4})\/stream$/i);
  if (streamMatch && req.method === 'GET') {
    const roomId = streamMatch[1].toUpperCase();
    const secretToken = url.searchParams.get('token') || '';
    let entry = rooms.get(roomId);
    if (!entry) {
      entry = {
        publicState: null,
        rolesByToken: {},
        hostToken: secretToken,
        pendingActions: [],
        clients: new Set(),
      };
      rooms.set(roomId, entry);
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const clientObj = { res, secretToken };
    entry.clients.add(clientObj);

    if (entry.publicState) {
      const privateRole = entry.rolesByToken[secretToken] || null;
      res.write(`data: ${JSON.stringify({ roomState: entry.publicState, privateRole })}\n\n`);
    }

    req.on('close', () => {
      entry.clients.delete(clientObj);
    });
    return;
  }

  // Host pushes authoritative state snapshot: POST /api/rooms/:roomId/sync
  const syncMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{4})\/sync$/i);
  if (syncMatch && req.method === 'POST') {
    const roomId = syncMatch[1].toUpperCase();
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        let entry = rooms.get(roomId);
        if (!entry) {
          entry = {
            publicState: parsed.roomState,
            rolesByToken: parsed.rolesByToken || {},
            hostToken: parsed.hostToken || '',
            pendingActions: [],
            clients: new Set(),
          };
          rooms.set(roomId, entry);
        } else {
          entry.publicState = parsed.roomState;
          entry.rolesByToken = parsed.rolesByToken || {};
        }
        broadcastRoom(roomId);
        const actionsToFlush = [...entry.pendingActions];
        entry.pendingActions = [];
        sendJson(res, 200, { ok: true, pendingActions: actionsToFlush });
      } catch (e) {
        sendJson(res, 400, { error: 'Invalid JSON' });
      }
    });
    return;
  }

  // Guest dispatches an action to the room: POST /api/rooms/:roomId/action
  const actionMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{4})\/action$/i);
  if (actionMatch && req.method === 'POST') {
    const roomId = actionMatch[1].toUpperCase();
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const entry = rooms.get(roomId);
        if (!entry) {
          return sendJson(res, 404, { error: 'Room not found' });
        }
        entry.pendingActions.push(parsed);
        // Notify host stream immediately
        for (const client of entry.clients) {
          if (client.secretToken === entry.hostToken) {
            client.res.write(`data: ${JSON.stringify({ clientAction: parsed })}\n\n`);
          }
        }
        sendJson(res, 200, { ok: true });
      } catch {
        sendJson(res, 400, { error: 'Invalid action payload' });
      }
    });
    return;
  }

  // Serve static production frontend from ../dist if available
  const distDir = path.join(__dirname, '..', 'dist');
  const safePath = path.normalize(url.pathname === '/' ? '/index.html' : url.pathname);
  const filePath = path.join(distDir, safePath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.svg': 'image/svg+xml',
      '.json': 'application/json',
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    return fs.createReadStream(filePath).pipe(res);
  }

  sendJson(res, 404, { error: 'Not found' });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🔥 CIRCLE OF SHAQ Native Real-Time Server running on http://localhost:${PORT}`);
});
