# Tech Stack – What, Where, When, and Why

This document explains, from end to end, the technologies used in Happening and exactly how they fit together.

## Frontend (Next.js + React)
- What: Next.js app that renders the user interface and talks to the API.
- Where: `client/`
- Key files:
  - Routing/pages: `client/pages/_app.js`, `client/pages/media.js`, `client/pages/switch/[id].js`, `client/pages/organizations.js`, `client/pages/organization/[id].js`
  - Components: `client/components/Navbar.js`, `client/components/InvitationsButton.js`, `client/components/InviteToOrgButton.js`
  - API client: `client/lib/api.js`
- When it’s used:
  - Users log in, browse Upcoming Events, book seats, manage their bookings, and—if they’re Organizers—create and manage events.
  - The special route `switch/[id]` shows the dashboard for a single org and hides/shows sections based on the user’s role in that org.
- Why Next.js: Simple file‑based routing, fast dev cycle, React ecosystem, easy deployment.

### Styling (Tailwind CSS)
- What: Utility‑first CSS framework.
- Where: `client/tailwind.config.js`, `client/styles/globals.css`
- When: All pages/components use Tailwind classes for consistent, responsive UI.
- Why: Rapid UI iteration with design consistency.

## Authentication & RBAC (Keycloak)
- What: Identity provider handling login, tokens, and roles.
- Where:
  - Frontend init: `client/lib/keycloak.js`
  - Backend protection: `server/middleware/keycloak.js`
- When:
  - On login, Keycloak issues tokens. The backend validates requests; the frontend reads `tokenParsed` to personalize the UI.
  - Roles per organization (OrgAdmin, Organizer, User) drive which sections the UI reveals.
- Why: Standard, secure auth with SSO and social login support.

## Backend API (Node.js + Express)
- What: REST API exposing users, organizations, events, bookings, and notifications.
- Where: `server/index.js`, routes under `server/routes/`
- Important routes:
  - Users: `server/routes/users.js`
  - Organizations: `server/routes/organizations.js`
  - Invites: `server/routes/orgInvites.js`
  - Events: `server/routes/events.js`
  - Bookings (core logic): `server/routes/bookings.js`
  - Notifications (read API): `server/routes/notifications.js`
- When: The frontend calls these endpoints for all CRUD and booking actions.
- Why Express: Lightweight, familiar, and flexible.

## Database (PostgreSQL)
- What: Source of truth for all persistent data.
- Where: `server/config/db.js` (pool), `server/sql/schema.sql` (DDL)
- Key tables (high level):
  - `events(org_id, name, event_date, total_slots, available_slots, ...)`
  - `bookings(event_id, user_id, seats, status, waiting_number, ...)`
  - `booking_seats(event_id, booking_id, user_id, seat_no, status)`
  - `booking_history(booking_id, action, details, created_at)`
  - `notifications(user_id, event_id, type, message, status)`
- When: API writes/reads these tables for every user action.
- Why Postgres: ACID guarantees, relational integrity, strong SQL features.

## Concurrency & Waitlist (Redis)
- What: In‑memory data store used for atomic counters and queues.
- Where: `server/config/redis.js`; used in `server/routes/bookings.js`
- Keys and semantics:
  - Counter per event: `event:{eventId}:slots`
    - `DECRBY` when trying to reserve seats.
    - If result < 0, revert with `INCRBY` and fall back to waitlist.
  - Waitlist per event: `event:{eventId}:waitlist`
    - `RPUSH` userId when event is full.
    - `LPOP` next user for promotion on cancellations.
- When: On booking create/cancel; during promotions from waitlist.
- Why Redis: Atomic ops and fast queues for correct, high‑concurrency seat handling.

## Asynchronous Notifications (RabbitMQ)
- What: Message broker to decouple the API from notification sending.
- Where:
  - Publish helper: `server/config/rabbitmq.js`
  - API publisher: `server/routes/bookings.js` (publishes `booking_confirmed`, `booking_waitlisted`, `waitlist_promoted`)
  - Worker consumer: `server/workers/notificationsWorker.js`
- Queue:
  - `notifications` (durable)
- When:
  - After booking create/promote, the API sends a message.
  - The worker consumes, logs the notification (email/SMS integration point), and acknowledges.
- Why RabbitMQ: Reliable delivery, back‑pressure, horizontal scaling of workers.

## Realtime (Socket.IO – Optional)
- What: Socket.IO server prepared for future realtime features.
- Where: Initialized in `server/index.js`.
- When: Not critical to current flows, available for live updates if needed.

## Containerization & Local Infra (Docker Compose)
- What: One‑command local infra for Postgres, Redis, RabbitMQ, Keycloak.
- Where: `docker/docker-compose.yml`
- Default ports:
  - Postgres 5432, Redis 6379
  - RabbitMQ 5672 (AMQP) / 15672 (web UI)
  - Keycloak 8080
- Why: Reproducible local environment matching production components.

## Configuration & Environment
- Backend loads environment from `.env` (see `server/env.txt` for sample values).
- RabbitMQ URL: `RABBITMQ_URL` (defaults to `amqp://happening:happening@rabbitmq:5672`)
- Redis URL: `REDIS_URL` (defaults to `redis://redis:6379`)
- Server Port: `PORT` (default 5000)

## Developer Workflows
- Start infra: `cd docker && docker compose up -d`
- Run API: `cd server && npm install && npm run dev`
- Run worker: `cd server && npm run worker:notifications`
- Run client: `cd client && npm install && npm run dev`

## Observability & Live Debugging Tips
- Redis:
  - `docker exec -it happening-redis redis-cli GET event:<EVENT_ID>:slots`
  - `LLEN/LRANGE event:<EVENT_ID>:waitlist`
- RabbitMQ:
  - Visit `http://localhost:15672`, queue `notifications` to see publish/consume rates.
- API health:
  - `GET /` and `GET /db-test` on the server.
