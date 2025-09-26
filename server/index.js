const express = require('express');
const http = require('http');
const cors = require('cors');
const session = require('express-session');
require('dotenv').config();



const pool = require('./config/db'); // PostgreSQL for user/media metadata
const { initKeycloak, memoryStore } = require('./middleware/keycloak');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST"]
  }
});

// Yjs WebSocket removed

// index.js
app.set('io', io);
app.use(cors());
app.use(express.json());
app.use(session({
  secret: 'someSecret',
  resave: false,
  saveUninitialized: true,
  store: memoryStore
}));

// Initialize Keycloak
const keycloak = initKeycloak();
app.use(keycloak.middleware());

// Ensure database schema exists on startup
async function ensureSchema() {
  try {
    const schemaPath = path.join(__dirname, 'sql', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(sql);
    console.log('🗄️  Database schema initialized.');
  } catch (err) {
    console.warn('⚠️  Failed to initialize schema (continuing):', err.message);
  }
}

// Import routes
const usersRoutes = require('./routes/users');
// Media routes removed (no file storage)
const eventsRoutes = require('./routes/events');
const bookingsRoutes = require('./routes/bookings');
const notificationsRoutes = require('./routes/notifications');

const orgInvitesRoutes = require('./routes/orgInvites');
const organizationsRoutes = require('./routes/organizations');



app.use('/users', usersRoutes);
app.use('/events', eventsRoutes);
app.use('/bookings', bookingsRoutes);
app.use('/notifications', notificationsRoutes);

app.use('/uploads', express.static('uploads'));
app.use('/org-invites', orgInvitesRoutes);
app.use('/organizations', organizationsRoutes);



// Socket.IO logic
io.on('connection', (socket) => {
  console.log('🔗 User connected:', socket.id);

  // Join an event room to receive seat hold updates
  socket.on('event:join', async ({ eventId }) => {
    if (!eventId) return;
    socket.join(`event:${eventId}`);
    socket.data = socket.data || {};
    socket.data.eventId = eventId;
  });

  // Set or refresh holds for a list of seats
  // Payload: { eventId, seats: number[] }
  socket.on('event:holds:set', async ({ eventId, seats }) => {
    try {
      if (!eventId || !Array.isArray(seats)) return;
      const { getRedis } = require('./config/redis');
      const redis = getRedis();
      const ttlSeconds = 5; // Reduced to 5 seconds for auto-deselection

      // Save a set of seats held by this socket for clean-up
      const socketKey = `socket:${socket.id}:event:${eventId}`;
      // Determine previous holds to compute removed
      const prevSeats = new Set(await redis.smembers(socketKey).then((arr) => arr.map((x) => Number(x))));
      const newSeats = new Set((seats || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0));

      // Check for conflicts - only allow seats that aren't already held by others
      const allowedSeats = [];
      for (const seat of newSeats) {
        const holdKey = `event:${eventId}:hold:${seat}`;
        const currentOwner = await redis.get(holdKey);

        // Allow if not held by anyone, or if held by this same socket
        if (!currentOwner || currentOwner === socket.id) {
          allowedSeats.push(seat);
        }
      }

      // Add/update holds only for allowed seats
      for (const seat of allowedSeats) {
        const holdKey = `event:${eventId}:hold:${seat}`;
        await redis.set(holdKey, socket.id, 'EX', ttlSeconds);
        await redis.sadd(socketKey, String(seat));
      }

      // Remove holds no longer in the list (if still owned by this socket)
      for (const seat of prevSeats) {
        if (!allowedSeats.includes(seat)) {
          const holdKey = `event:${eventId}:hold:${seat}`;
          const owner = await redis.get(holdKey);
          if (owner === socket.id) await redis.del(holdKey);
          await redis.srem(socketKey, String(seat));
        }
      }

      // Broadcast updated held seats list
      const keys = await redis.keys(`event:${eventId}:hold:*`);
      const heldSeats = keys.map(k => Number(k.split(':').slice(-1)[0])).filter(n => Number.isFinite(n));
      io.to(`event:${eventId}`).emit('event:holds:update', { eventId, heldSeats });

      // Send response to the requesting socket with allowed seats
      socket.emit('event:holds:response', {
        eventId,
        requestedSeats: Array.from(newSeats),
        allowedSeats,
        conflicts: Array.from(newSeats).filter(s => !allowedSeats.includes(s))
      });
    } catch (err) {
      console.warn('holds:set error', err.message);
    }
  });

  // Heartbeat to extend holds while the user keeps the modal open
  socket.on('event:holds:heartbeat', async ({ eventId }) => {
    try {
      if (!eventId) return;
      const { getRedis } = require('./config/redis');
      const redis = getRedis();
      const ttlSeconds = 5; // Consistent with holds:set TTL
      const socketKey = `socket:${socket.id}:event:${eventId}`;
      const seats = await redis.smembers(socketKey);
      for (const s of seats) {
        const holdKey = `event:${eventId}:hold:${Number(s)}`;
        const owner = await redis.get(holdKey);
        if (owner === socket.id) await redis.set(holdKey, socket.id, 'EX', ttlSeconds);
      }
    } catch { }
  });

  // Clear all holds for this socket in the event
  socket.on('event:holds:clear', async ({ eventId }) => {
    try {
      if (!eventId) return;
      const { getRedis } = require('./config/redis');
      const redis = getRedis();
      const socketKey = `socket:${socket.id}:event:${eventId}`;
      const seats = await redis.smembers(socketKey);
      for (const s of seats) {
        const holdKey = `event:${eventId}:hold:${Number(s)}`;
        const owner = await redis.get(holdKey);
        if (owner === socket.id) await redis.del(holdKey);
      }
      await redis.del(socketKey);
      const keys = await redis.keys(`event:${eventId}:hold:*`);
      const heldSeats = keys.map(k => Number(k.split(':').slice(-1)[0])).filter(n => Number.isFinite(n));
      io.to(`event:${eventId}`).emit('event:holds:update', { eventId, heldSeats });
    } catch { }
  });

  socket.on('disconnect', async () => {
    console.log('❌ User disconnected:', socket.id);
    try {
      const { getRedis } = require('./config/redis');
      const redis = getRedis();
      // Find all socket keys, pattern-based cleanup
      const keys = await redis.keys(`socket:${socket.id}:event:*`);
      for (const key of keys) {
        const eventId = key.split(':').slice(-1)[0];
        const seats = await redis.smembers(key);
        for (const s of seats) {
          const holdKey = `event:${eventId}:hold:${Number(s)}`;
          const owner = await redis.get(holdKey);
          if (owner === socket.id) await redis.del(holdKey);
        }
        await redis.del(key);
        const keys2 = await redis.keys(`event:${eventId}:hold:*`);
        const heldSeats = keys2.map(k => Number(k.split(':').slice(-1)[0])).filter(n => Number.isFinite(n));
        io.to(`event:${eventId}`).emit('event:holds:update', { eventId, heldSeats });
      }
    } catch { }
  });
});

// Basic routes
app.get('/', (req, res) => {
  res.json({
    message: "Happening API Server",
    status: "Running",
    features: [
      "Multi-tenant Event Booking",
      "Waitlist & Real-time Seat Tracking",
      "Role-based Access Control",
      "RabbitMQ Notifications"
    ]
  });
});

app.get('/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      postgresql: result.rows[0],
      socketio: 'Ready ✅'
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('DB query failed');
  }
});



const PORT = process.env.PORT || 5000;
ensureSchema().finally(() => {
  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔌 Socket.IO ready for real-time features`);
  });
});
