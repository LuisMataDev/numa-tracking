// mobile.js
require('dotenv').config();

const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { io: ClientIO } = require('socket.io-client'); // npm i socket.io-client si no lo tienes
const fetch = global.fetch || require('node-fetch'); // node 18+ tiene fetch global, si no instala node-fetch

const app = express();
app.use(express.json());

// carpeta pública para los assets móviles (pon aquí mobile.html, mobile-login.html, mobile-client.js, mobile.css)

const PUBLIC_DIR = path.join(__dirname, 'public_mobile');
app.use(express.static(PUBLIC_DIR));

// Agrega esta nueva ruta para servir mobile-login.html en la raíz
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'mobile-login.html'));
});

// URL del server principal (donde está tu server.js)
const MAIN_SERVER = process.env.MAIN_SERVER_URL || 'http://localhost:3000';

// --- Proxy simple para login: reenvía /api/routes/login a MAIN_SERVER/api/routes/login
app.post('/api/routes/login', async (req, res) => {
  try {
    const r = await fetch(`${MAIN_SERVER}/api/routes/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const body = await r.json().catch(() => ({}));
    res.status(r.status).json(body);
  } catch (err) {
    console.error('[mobile] error proxying /api/routes/login', err);
    res.status(500).json({ error: 'Error proxy login' });
  }
});

// También proxy para marcar login/logout del driver (opcional)
app.post('/api/drivers/:id/login', async (req, res) => {
  try {
    const r = await fetch(`${MAIN_SERVER}/api/drivers/${encodeURIComponent(req.params.id)}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {})
    });
    const body = await r.json().catch(() => ({}));
    res.status(r.status).json(body);
  } catch (err) {
    console.error('[mobile] proxy driver login', err);
    res.status(500).json({ error: 'Error proxy driver login' });
  }
});

// HTTP server + Socket.IO (para navegadores móviles)
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' } // ajustar en producción
});

// SOCKET.IO CLIENT hacia MAIN SERVER (reenvío)
const mainSocket = ClientIO(MAIN_SERVER, {
  reconnection: true,
  transports: ['websocket', 'polling']
});

mainSocket.on('connect', () => {
  console.log('[mobile->main] conectado a MAIN_SERVER socket:', mainSocket.id);
});
mainSocket.on('connect_error', (err) => {
  console.warn('[mobile->main] connect_error', err && err.message);
});

// Si MAIN_SERVER emite routeStatusChanged o locationUpdate que te interesen, reemítelos a los móviles
mainSocket.on('routeStatusChanged', (payload) => {
  try {
    const routeId = payload && (payload.id || payload._id);
    if (routeId) {
      io.to(String(routeId)).emit('routeStatusChanged', payload);
    } else {
      io.emit('routeStatusChanged', payload);
    }
  } catch (e) {
    console.error('[mobile] error rebroadcast routeStatusChanged', e);
  }
});

// Si MAIN_SERVER envía locationUpdate (por cualquier motivo) lo reenviamos a móviles también (opcional)
mainSocket.on('locationUpdate', (payload) => {
  try {
    const routeId = payload && payload.routeId;
    if (routeId) io.to(String(routeId)).emit('locationUpdate', payload);
    else io.emit('locationUpdate', payload);
  } catch (e) {
    console.error('[mobile] error rebroadcast locationUpdate', e);
  }
});

// Manejo de conexiones de navegadores móviles
io.on('connection', (socket) => {
  console.log('[mobile.io] navegador móvil conectado', socket.id);

  // cliente móvil se une a la sala de la ruta
  socket.on('joinRoute', ({ routeId, driverId }) => {
    if (!routeId) return;
    socket.join(String(routeId));
    socket.routeId = routeId;
    socket.driverId = driverId || null;
    console.log(`[mobile.io] ${socket.id} joined route ${routeId} (driver:${driverId})`);
    // opcional: notificar MAIN_SERVER que este móvil está "online" (emite un evento si lo necesitas)
    mainSocket.emit('mobileConnected', { routeId, driverId, socketId: socket.id });
  });

  // cuando el móvil envía ubicación, la reenviamos al MAIN_SERVER por socket.io-client
  socket.on('driverLocation', (data) => {
    try {
      if (!data) return;
      const payload = {
        lat: Number(data.lat),
        lng: Number(data.lng),
        timestamp: data.timestamp || Date.now(),
        driverId: data.driverId || socket.driverId || null,
        routeId: data.routeId || socket.routeId || null,
        isOffRoute: data.isOffRoute || false,
        accuracy: data.accuracy || null
      };

      // Reenviar a MAIN_SERVER por socket.io-client
      if (mainSocket && mainSocket.connected) {
        mainSocket.emit('driverLocation', payload);
      } else {
        // fallback: enviar por HTTP (si quieres implementar /api/locations en MAIN_SERVER)
        console.warn('[mobile] mainSocket no conectado — podrías implementar fallback HTTP');
      }

      // optional: ack al móvil
      socket.emit('locationAck', { ok: true, ts: Date.now() });
    } catch (e) {
      console.error('[mobile] error handling driverLocation', e);
    }
  });

  // --- NUEVO: Reenvío de la solicitud para finalizar ruta ---
  // Escuchamos el evento que viene del móvil...
  socket.on('requestFinishRoute', (data) => {
    try {
        console.log(`[mobile.io] Recibida 'requestFinishRoute' de ${socket.id}. Reenviando a MAIN_SERVER.`);
        // ...y lo reenviamos directamente al servidor principal.
        if (mainSocket && mainSocket.connected) {
            mainSocket.emit('requestFinishRoute', data);
        } else {
            console.warn('[mobile] mainSocket no conectado — No se pudo reenviar la solicitud de finalización.');
        }
    } catch (e) {
        console.error('[mobile] Error reenviando requestFinishRoute', e);
    }
  });
});

// arrancar server
const PORT = process.env.MOBILE_PORT || 4000;
server.listen(PORT, () => {
  console.log(`[mobile] servidor móvil escuchando en http://localhost:${PORT} (sirve ${PUBLIC_DIR})`);
  console.log(`[mobile] proxying logins & realtime to MAIN_SERVER=${MAIN_SERVER}`);
});
