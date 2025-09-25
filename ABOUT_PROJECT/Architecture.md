## Architecture

Happening is a multi‑tenant, service‑oriented web application with a real‑time booking core. It combines PostgreSQL (source of truth), Redis (concurrency + waitlist), RabbitMQ (notifications), and Keycloak (AuthN/AuthZ) behind a web frontend (Next.js) and Node.js backend.

### High‑Level Diagram (conceptual)

- Client (Next.js) ↔ Backend API (Node.js)
- Backend ↔ PostgreSQL (transactions, auditing)
- Backend ↔ Redis (seat counters, locks, waitlist queue)
- Backend → RabbitMQ (notification jobs) → Workers → Providers (email/SMS/push)
- Backend ↔ Keycloak (OIDC/OAuth2, RBAC via tokens + DB roles)
- Realtime: WebSocket/Socket.IO channel for seat map presence and updates

### Modules

- Organizations & RBAC: orgs, members, roles (orgAdmin, organizer, user)
- Events: lifecycle (upcoming/ongoing/completed/cancelled), capacity
- Bookings: seat selection, confirmation, waiting, cancellation
- Waitlist: FCFS queue, promotion on cancellation
- Notifications: durable events, async workers, status tracking
- Auditing: booking_history and organizational audit events

### Data Stores

- PostgreSQL: user/org/event/booking tables, history, notifications
- Redis: `event:{eventId}:slots` (counter), `event:{eventId}:waitlist` (list), `booking:{eventId}:{userId}` (lock)
- RabbitMQ: fanout/work queues for notification pipelines

### Realtime Seat Coordination

- Socket.IO room per event broadcasts:
  - Seat selection/hold events
  - Seat confirmation (freeze)
  - Cancellations and promotions

### Consistency Model

- PostgreSQL is source of truth for bookings.
- Redis is used for atomic counters and queue semantics; on divergence, DB reconciliation jobs ensure consistency.
- All state transitions are recorded in `booking_history`.

### Failure Scenarios & Handling

- Worker failure: jobs remain pending; retries with backoff, dead‑letter queue if configured.
- WebSocket disconnects: client resync on reconnect with server truth.
- Double‑submit: Redis lock `booking:{eventId}:{userId}` with short TTL.

### Code Map (repo)

- Client (`client/`): components, pages, Keycloak integration
- Server (`server/`): routes (`bookings.js`, `events.js`, `organizations.js`, `notifications.js`, `orgInvites.js`, `users.js`), workers (`notificationsWorker.js`), config (Redis, RabbitMQ, DB)
- SQL (`server/sql/`): `schema_improved.sql`, `migration_to_improved.sql`, improvements notes
- Docker (`docker/`): `docker-compose.yml`, Keycloak theme assets


