# Redis & RabbitMQ System Analysis - Happening Event Booking Platform

## Overview

This document provides a comprehensive analysis of how Redis and RabbitMQ are used in the Happening event booking platform, including their roles, data structures, and the producer-consumer patterns implemented.

## System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   Workers       │
│   (Next.js)     │◄──►│   (Node.js)     │◄──►│   (RabbitMQ)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   PostgreSQL    │
                    │   (Source of    │
                    │    Truth)       │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │     Redis       │
                    │   (Concurrency │
                    │   & Waitlist)  │
                    └─────────────────┘
```

## Redis Role & Implementation

### Purpose
Redis serves as a **high-performance cache and concurrency control system** for real-time seat management and waitlist operations.

### Key Redis Data Structures

#### 1. Event Slot Counter
```javascript
Key: event:{eventId}:slots
Type: Integer
Purpose: Tracks available seats atomically
```

**Usage in Code:**
```javascript
// From server/routes/bookings.js
let key = `event:${event_id}:slots`;
let current = await redis.get(key);
if (current === null) {
    // Sync with DB on cold start
    const { rows: evRows } = await client.query('SELECT available_slots FROM events WHERE id=$1', [event_id]);
    const available = Number(evRows?.[0]?.available_slots || 0);
    await redis.set(key, available);
}
// Atomic decrement
let remaining = await redis.decrby(key, seats);
```

#### 2. Event Waitlist Queue
```javascript
Key: event:{eventId}:waitlist
Type: List (FIFO)
Purpose: First-come-first-served waitlist management
```

**Usage in Code:**
```javascript
// Add to waitlist
waiting_number = await redis.rpush(`event:${event_id}:waitlist`, user_id);

// Promote from waitlist
const nextUserId = await redis.lpop(`event:${booking.event_id}:waitlist`);
```

#### 3. Seat Hold Locks
```javascript
Key: event:{eventId}:hold:{seatNumber}
Type: String with TTL
Purpose: Temporary seat reservations during selection
```

**Usage in Code:**
```javascript
// From server/index.js Socket.IO logic
const holdKey = `event:${eventId}:hold:${seat}`;
await redis.set(holdKey, socket.id, 'EX', ttlSeconds);
```

#### 4. Socket Session Tracking
```javascript
Key: socket:{socketId}:event:{eventId}
Type: Set
Purpose: Track seats held by specific socket connections
```

### Redis Configuration
```javascript
// From server/config/redis.js
const Redis = require('ioredis');
const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';

function getRedis() {
  if (!redisClient) {
    redisClient = new Redis(redisUrl);
  }
  return redisClient;
}
```

### Redis Use Cases

1. **Atomic Seat Counter Management**
   - Prevents race conditions during high-concurrency booking
   - Ensures accurate seat availability

2. **Real-time Seat Holds**
   - Temporary reservations during seat selection
   - Auto-expiration prevents seat hoarding

3. **Waitlist Management**
   - FIFO queue for fair seat allocation
   - Automatic promotion when seats become available

4. **Session Management**
   - Track user sessions and held seats
   - Cleanup on disconnect

## RabbitMQ Role & Implementation

### Purpose
RabbitMQ serves as a **message broker for asynchronous notification processing**, ensuring reliable delivery of booking confirmations, waitlist updates, and other user notifications.

### Message Queue Architecture

#### Queue Configuration
```javascript
// From server/config/rabbitmq.js
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://happening:happening@rabbitmq:5672';

async function publish(queueName, message) {
  const conn = await getConnection();
  const channel = await conn.createChannel();
  await channel.assertQueue(queueName, { durable: true });
  channel.sendToQueue(queueName, Buffer.from(JSON.stringify(message)), {
    persistent: true,
    contentType: 'application/json',
  });
}
```

#### Queue: `notifications`
- **Durability**: Persistent (survives broker restarts)
- **Message Format**: JSON
- **Content Type**: application/json

### Producer Implementation

#### Notification Producers (Backend API)
```javascript
// From server/routes/bookings.js
// Booking confirmation notification
await publish('notifications', {
    type: status === 'confirmed' ? 'booking_confirmed' : 'booking_waitlisted',
    eventId: event_id,
    userId: user_id,
    seats,
});

// Waitlist promotion notification
await publish('notifications', { 
    type: 'waitlist_promoted', 
    eventId: booking.event_id, 
    userId: nextUserId 
});
```

#### Message Types Produced
1. **booking_confirmed** - User successfully booked seats
2. **booking_waitlisted** - User placed on waitlist
3. **waitlist_promoted** - User promoted from waitlist to confirmed
4. **booking_cancelled** - User cancelled their booking
5. **event_cancelled** - Event organizer cancelled event
6. **invitation_received** - User invited to organization

### Consumer Implementation

#### Notification Worker
```javascript
// From server/workers/notificationsWorker.js
const QUEUE = process.env.NOTIFICATIONS_QUEUE || 'notifications';

async function start() {
    const conn = await amqplib.connect(RABBITMQ_URL);
    const channel = await conn.createChannel();
    await channel.assertQueue(QUEUE, { durable: true });
    channel.prefetch(10); // Process up to 10 messages concurrently
    
    channel.consume(QUEUE, async (msg) => {
        if (!msg) return;
        try {
            const payload = JSON.parse(msg.content.toString());
            const { type, eventId, userId, seats } = payload;
            
            console.log(`🔔 Notification: ${type} | event=${eventId} user=${userId} seats=${seats ?? ''}`);
            
            // TODO: Integrate with real email/SMS/push providers
            // await sendEmail(userId, type, payload);
            // await sendSMS(userId, type, payload);
            // await sendPushNotification(userId, type, payload);
            
            channel.ack(msg); // Acknowledge successful processing
        } catch (e) {
            console.error('❌ Failed to process notification:', e.message);
            channel.nack(msg, false, false); // Reject and don't requeue
        }
    });
}
```

### Docker Configuration

#### RabbitMQ Service
```yaml
# From docker/docker-compose.yml
rabbitmq:
  image: rabbitmq:3-management
  container_name: happening-rabbitmq
  ports:
    - "5672:5672"    # AMQP port
    - "15672:15672"  # Management UI
  environment:
    RABBITMQ_DEFAULT_USER: happening
    RABBITMQ_DEFAULT_PASS: happening
```

#### Notification Worker Service
```yaml
notifications-worker:
  build:
    context: ../server
    dockerfile: Dockerfile
  command: ["npm", "run", "worker:notifications"]
  environment:
    - RABBITMQ_URL=amqp://happening:happening@rabbitmq:5672
  depends_on:
    - rabbitmq
```

## Producer-Consumer Flow

### 1. Booking Flow with Notifications

```mermaid
sequenceDiagram
    participant U as User
    participant API as Backend API
    participant R as Redis
    participant DB as PostgreSQL
    participant RMQ as RabbitMQ
    participant W as Notification Worker

    U->>API: Request booking
    API->>R: Check seat availability
    API->>R: Atomic decrement counter
    API->>DB: Create booking record
    API->>RMQ: Publish notification
    API->>U: Return booking status
    RMQ->>W: Deliver message
    W->>W: Process notification
    W->>U: Send email/SMS/push
```

### 2. Waitlist Promotion Flow

```mermaid
sequenceDiagram
    participant C as Cancellation
    participant API as Backend API
    participant R as Redis
    participant DB as PostgreSQL
    participant RMQ as RabbitMQ
    participant W as Notification Worker

    C->>API: Cancel booking
    API->>R: Increment available seats
    API->>R: Pop from waitlist
    API->>DB: Update booking status
    API->>RMQ: Publish promotion notification
    RMQ->>W: Deliver message
    W->>W: Process notification
    W->>U: Send promotion email
```

## Key Benefits of This Architecture

### Redis Benefits
1. **High Performance**: Sub-millisecond response times for seat operations
2. **Atomic Operations**: Prevents race conditions in concurrent bookings
3. **Real-time Updates**: Immediate seat availability updates
4. **Session Management**: Efficient tracking of user sessions

### RabbitMQ Benefits
1. **Reliability**: Durable messages survive system failures
2. **Scalability**: Can handle high notification volumes
3. **Decoupling**: API doesn't wait for notification processing
4. **Observability**: Management UI for monitoring queues

## Data Flow Summary

### Redis Data Flow
```
User Action → Redis Check → Atomic Operation → Real-time Broadcast
     ↓              ↓              ↓                    ↓
Seat Selection → Availability → Counter Update → Socket.IO Update
```

### RabbitMQ Data Flow
```
Booking Event → Message Queue → Worker Processing → User Notification
     ↓              ↓              ↓                    ↓
API Response → RabbitMQ → Notification Worker → Email/SMS/Push
```

## Monitoring & Management

### Redis Monitoring
- Monitor memory usage and key expiration
- Track connection counts and operations per second
- Use Redis CLI: `redis-cli monitor`

### RabbitMQ Management
- Access management UI at `http://localhost:15672`
- Monitor queue depths and message rates
- Track consumer connections and processing rates

## Configuration Files

### Environment Variables
```bash
# Redis
REDIS_URL=redis://redis:6379

# RabbitMQ
RABBITMQ_URL=amqp://happening:happening@rabbitmq:5672
NOTIFICATIONS_QUEUE=notifications
```

### Package Dependencies
```json
{
  "dependencies": {
    "ioredis": "^5.4.1",      // Redis client
    "amqplib": "^0.10.4"      // RabbitMQ client
  }
}
```

## Conclusion

This architecture provides a robust, scalable solution for real-time event booking with:

- **Redis**: Handles high-concurrency seat management and real-time updates
- **RabbitMQ**: Ensures reliable notification delivery
- **PostgreSQL**: Maintains data integrity and serves as source of truth
- **Socket.IO**: Provides real-time user experience

The producer-consumer pattern with RabbitMQ decouples notification processing from the main API, ensuring the booking system remains responsive even under high load.
