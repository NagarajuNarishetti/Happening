# Happening — A to Z Project Review

This single document gives you everything you need to understand Happening, from non‑technical overview to deep technical details: what it is, why we built it, how it works, where each part lives in the code, and how to run, test, deploy, and operate it.

## What is Happening (Non‑Technical)

- **Problem**: Organizations run events with limited seats. Users need to book reliably under concurrency; organizers need waitlists, notifications, and role‑based access.
- **Solution**: A multi‑tenant event booking platform with per‑seat allocation, real‑time availability, automatic waitlist promotion, and notifications.
- **For whom**:
  - **Org Admins**: manage organizations, members, roles.
  - **Organizers**: create and manage events.
  - **Users**: browse events and book seats.
- **Key outcomes**: No double‑booking, fair waitlist handling, clear organization separation, and scalable notification processing.

## One‑Slide Summary (Executive)

- Frontend: Next.js + Tailwind UI. Auth via Keycloak.
- Backend: Node.js/Express. Persistence in PostgreSQL.
- Concurrency: Redis for atomic slot counters and waitlist queues.
- Async: RabbitMQ for notifications; worker consumes and sends.
- Realtime‑ready: Socket.IO wired for future live updates.
- Local infra via Docker Compose (Postgres, Redis, RabbitMQ, Keycloak).

## Core Features

- Multi‑tenant orgs with roles: orgAdmin, organizer, user.
- Event CRUD with categories and seat counts.
- Per‑seat selection and allocation; auto‑assignment fallback.
- Booking with atomic seat reservation; waitlist on overflow.
- Cancellation with automatic waitlist promotion and seat reassignment.
- Notifications on booking confirmation/waitlisting/promotion.
- Organization switching view to work in a single‑org context.

## Architecture Overview

Components:
- **Client (Next.js)**: Authenticated UI, pages for events, organizations, org switching.
- **API (Express)**: REST endpoints for users, organizations, events, bookings, notifications.
- **PostgreSQL**: Source of truth for entities and per‑seat allocations.
- **Redis**: Atomic counters for event slots; waitlist queues.
- **RabbitMQ**: Notification pipeline between API and worker.
- **Keycloak**: Identity provider and RBAC.
- **Socket.IO**: Bootstrapped for realtime features.

Data flows:
- Create booking → Redis DECRBY; if negative revert and enqueue waitlist; persist booking; publish notification.
- Cancel booking → free seats; Redis INCRBY; promote from waitlist (LPOP) one‑by‑one; assign seats; publish notification.

## Domain Model (High Level)

- Organization, User, OrganizationUser(role)
- Event(total_slots, available_slots, status)
- Booking(seats, status=confirmed|waiting|cancelled, waiting_number)
- BookingSeat(event_id, booking_id, user_id, seat_no, status)
- BookingHistory(action=created|cancelled|promoted)
- Notification(type, message, status)

Refer to `server/sql/schema.sql` for DDL and indexes.

## Tech Stack and Why

- **Next.js + React**: Fast dev, file‑based routing, rich ecosystem.
- **Tailwind CSS**: Rapid, consistent styling.
- **Node.js + Express**: Lightweight, familiar REST API.
- **PostgreSQL**: ACID integrity for bookings and seat maps.
- **Redis**: Atomic counters/queues ensuring concurrency‑safe seat reservation.
- **RabbitMQ**: Reliable async notifications; supports scaling workers.
- **Keycloak**: Standards‑compliant auth and roles.
- **Socket.IO**: Optional realtime updates.
- **Docker Compose**: Reproducible local environment.

## Repository Map

```
happening/
  client/            # Next.js app (UI)
  server/            # Express API, routes, workers
  docker/            # Local infra (Postgres, Redis, RabbitMQ, Keycloak)
  ABOUT_PROJECT/     # Architecture and technology docs
  review.md          # This review file
  README.md
```

Notable paths:
- Client pages: `client/pages/media.js`, `client/pages/switch/[id].js`, `client/pages/organizations.js`, `client/pages/organization/[id].js`.
- API routes: `server/routes/events.js`, `server/routes/bookings.js`, `server/routes/organizations.js`, `server/routes/orgInvites.js`, `server/routes/users.js`, `server/routes/notifications.js`.
- Integrations: `server/config/redis.js`, `server/config/rabbitmq.js`, worker `server/workers/notificationsWorker.js`.

## Authentication and RBAC

- Keycloak provides login and tokens.
- Frontend initializes Keycloak in `client/lib/keycloak.js`, wired via `_app.js`.
- Backend protects routes with middleware in `server/middleware/keycloak.js`.
- Roles are per‑organization (`organization_users.role`) and drive UI visibility and API authorization.

## Event Lifecycle and Seat Management

Creation (`POST /events`):
- Persist in Postgres with `total_slots` and `available_slots`.
- Initialize Redis counter `event:{eventId}:slots = total_slots`.

Seat map (`GET /events/:id/seats`):
- Returns `{ total, taken[] }` from `booking_seats` for UI seat grid.

Update (`PUT /events/:id`):
- Edits metadata; updates Redis counter if `total_slots` changes.

Delete (`DELETE /events/:id`):
- Removes event and Redis key.

## Booking Flow (Concurrency‑Safe)

Create booking (`POST /bookings`):
1. Redis `DECRBY event:{id}:slots` by requested seats.
2. If result < 0 → revert with `INCRBY`, mark booking `waiting`, append user to `event:{id}:waitlist` with `RPUSH` (store waiting order).
3. Else `confirmed` → insert booking, allocate seat numbers:
   - Use requested `seat_numbers` if all free; else auto‑assign lowest available.
   - Insert rows into `booking_seats` and decrease `events.available_slots`.
4. Publish notification (`booking_confirmed` or `booking_waitlisted`).

Cancel booking (`POST /bookings/:id/cancel`):
1. Mark booking `cancelled`; free its seats in `booking_seats`.
2. Redis `INCRBY event:{id}:slots` by freed count; increase `events.available_slots`.
3. For each freed seat, `LPOP` next from waitlist, `UPDATE` booking to `confirmed`, allocate next free seat number, update `events.available_slots`, publish `waitlist_promoted`.

Cancel selected seats (`POST /bookings/:id/cancel-seats`):
- Same promotion loop, but for a subset of seats.

Seat allocation rules:
- Seat numbers are unique per event while `status='booked'` (unique index).
- If requested seats conflict, system auto‑assigns the lowest available seats.

## Notifications Pipeline

- API publishes to RabbitMQ queue `notifications` on booking confirmed/waitlisted/promoted.
- Worker (`server/workers/notificationsWorker.js`) consumes, sends/logs notifications, and acknowledges.
- Decouples user‑facing latency from notification delivery; supports horizontal worker scaling.

## Multi‑Tenancy Model

- `organizations` and `organization_users` maintain membership and role per user.
- UI provides an org‑switch route (`/switch/[id]`) to focus the dashboard on a single org and apply role‑based layouts.
- Backend queries filter by `org_id` as needed.

## Realtime Readiness

- Socket.IO is initialized in `server/index.js` and attached to the app. No critical logic depends on it yet; it is ready for live updates (e.g., seat changes) without page refresh.

## Database Schema (Key Tables)

- `events(id, org_id, name, description, category, event_date, total_slots, available_slots, status, …)`
- `bookings(id, event_id, user_id, seats, status, waiting_number, …)`
- `booking_seats(id, event_id, booking_id, user_id, seat_no, status)` (unique `(event_id, seat_no)` for booked)
- `booking_history(booking_id, action, details, created_at)`
- `notifications(user_id, event_id, type, message, status)`
- `organizations`, `users`, `organization_users(role)`

See `server/sql/schema.sql` for full DDL, indexes, and idempotent triggers.

## API Surface (Representative)

- Events
  - `POST /events` — create event (initializes Redis counter)
  - `GET /events` — list events
  - `GET /events/:id` — get event
  - `GET /events/:id/seats` — seat map
  - `PUT /events/:id` — update event (resets counter if total changes)
  - `DELETE /events/:id` — delete event (cleans Redis key)
- Bookings
  - `POST /bookings` — create booking with optional `seat_numbers`
  - `GET /bookings/user/:userId` — list bookings for user with event info
  - `POST /bookings/:id/cancel` — cancel whole booking, promote waitlist
  - `POST /bookings/:id/cancel-seats` — cancel selected seats, promote waitlist
- Organizations/Users/Invites/Notifications — standard CRUD and list endpoints

## Frontend UX Highlights

- Dashboard (`client/pages/media.js`):
  - Sections: Upcoming Events, Your Events, Events organized by you.
  - Org‑switching view (`/switch/[id]`) filters lists and role‑based actions.
  - Seat‑selection modal renders grid using `GET /events/:id/seats` and posts bookings.
  - Manage‑seats modal lets users cancel specific seats; triggers backend promotion.
- Global layout in `_app.js` wires Keycloak and passes it down; Tailwind for styling.

## Configuration & Environment

- Backend loads from `.env` (see `server/env.txt`) with defaults:
  - `PORT=5000`
  - `REDIS_URL=redis://redis:6379`
  - `RABBITMQ_URL=amqp://happening:happening@rabbitmq:5672`
- Client expects Keycloak realm/client configured; token stored in `localStorage` when authenticated.

## Local Development & Running

Prereqs: Docker, Node 18+.

1) Start infra:
```
cd docker
docker compose up -d
```
2) Backend API:
```
cd ../server
npm install
npm run dev
```
3) Frontend UI:
```
cd ../client
npm install
npm run dev
```

Default ports:
- Client: http://localhost:3000
- API: http://localhost:5000
- RabbitMQ UI: http://localhost:15672 (happening/happening)
- Keycloak: http://localhost:8080
- Postgres: 5432, Redis: 6379

## Operational Concerns

- Idempotent schema bootstrapping on server start (`server/index.js`) ensures tables exist in dev.
- Observability tips:
  - Redis: inspect counters and waitlists with `redis-cli`.
  - RabbitMQ: queue `notifications` shows publish/consume rates.
  - API health: `GET /` and `GET /db-test`.
- Failure modes and safety:
  - If Redis unavailable: seat decrement fails → booking creation returns 500; SQL remains consistent.
  - If RabbitMQ unavailable: booking still persists; publishing is best‑effort (errors swallowed), notification can be retried later.
  - Unique seat constraint prevents double allocation.

## Security

- AuthN/AuthZ via Keycloak; tokens validated by backend middleware.
- Role‑based UI; server‑side checks performed per route.
- Session store is in‑memory for dev; use external store in production.

## Scaling and Future Enhancements

- Scale API horizontally; Redis and Postgres act as shared state layers.
- Scale workers independently to handle notification spikes.
- Add Socket.IO broadcasts for seat updates to live dashboards.
- Introduce rate limits and circuit breakers around external systems.
- Replace in‑memory session store; add caching and read replicas as needed.

## How to Demo (Manager Walkthrough)

1. Log in via Keycloak and land on the dashboard.
2. Create an event (organizer role) — observe `total_slots` and `available_slots`.
3. Book seats via seat‑selection modal — see confirmation and seat numbers.
4. Over‑book to trigger waitlist — user is waitlisted; check Redis waitlist length.
5. Cancel an existing booking — watch waitlist promotion and reassigned seats.
6. Open RabbitMQ UI — verify notifications published and consumed.

## References (Where Things Live)

- Server entry: `server/index.js`
- Event routes: `server/routes/events.js`
- Booking routes: `server/routes/bookings.js`
- DB schema: `server/sql/schema.sql`
- Frontend dashboard: `client/pages/media.js`
- Keycloak init: `client/lib/keycloak.js`, middleware `server/middleware/keycloak.js`
- Notifications worker: `server/workers/notificationsWorker.js`
- Compose services: `docker/docker-compose.yml`

## Appendix: Architectural Rationale

- Using Redis for counters/queues isolates contention and keeps Postgres clean of hot‑row updates under high concurrency.
- RabbitMQ decouples user transactions from side effects, improving perceived latency and reliability.
- Per‑seat table supports explicit seat numbers and future seat‑map UI features.

— End of review —

## Personas and Stakeholders

- Org Admin
  - Goals: Create organizations, invite members, assign roles, ensure governance and policy compliance.
  - Pain points: Onboarding speed, least‑privilege access, auditability.
  - Success metrics: Time to onboard, accuracy of role assignments, minimal support tickets.
- Organizer
  - Goals: Create events, manage capacity, handle last‑minute changes.
  - Pain points: Overbooking risk, real‑time visibility, manual promotion from waitlists.
  - Success metrics: Fewer booking conflicts, faster event setup, automated waitlist handling.
- End User (Attendee)
  - Goals: Discover and book seats quickly; get notified about changes.
  - Pain points: Confusing seat selection, uncertainty on waitlist, slow performance during demand spikes.
  - Success metrics: Conversion rate, time‑to‑book, clarity of waitlist status.
- Operations/Support
  - Goals: Reliable system, actionable logs/metrics, clear runbooks.
  - Pain points: Noisy alerts, opaque failures.
  - Success metrics: MTTR, number of escalations, observability coverage.

## User Journeys

1) New user joins organization and books an event
- Receive org invite → accept → login → dashboard shows org context → browse events → open seat map → select seats → book → receive confirmation notification.

2) Booking during a high‑demand drop
- Many users click Book → Redis atomic counter serializes seat decrements → some confirm, overflow goes to waitlist → immediate feedback to users.

3) Cancellation and automatic promotion
- A confirmed user cancels → seats freed → system pops waitlist → earliest waiting booking is promoted → notification sent to the promoted user.

## UX Map and Screens

- Dashboard
  - Greeting and org context chip (opens org overview modal)
  - Upcoming Events card grid with availability and Book button
  - Your Events section with grouped bookings; View/Cancel options
  - Organizer section with Create/Edit/Delete Event
- Modals
  - Create Event
  - Edit Event
  - Organization Overview (members list)
  - Seat Selection (visual grid based on `GET /events/:id/seats`)
  - Manage Seats (cancel selected seats)

## Detailed API Specification

Conventions:
- Auth: Bearer token from Keycloak; backend validates and derives user identity where needed.
- Content‑Type: application/json
- Errors: `{ error: string }` with appropriate HTTP status codes.

### Events

- POST `/events`
  - Purpose: Create event and initialize capacity counter.
  - Body: `{ org_id: UUID, name: string, description?: string, category?: 'webinar'|'concert'|'hackathon', event_date: ISO8601, total_slots: number }`
  - Responses:
    - 201: Full event row
    - 500: `{ error }`
  - Side effects: `SET event:{id}:slots = total_slots` in Redis.

- GET `/events`
  - Purpose: List events (optionally filtered client‑side by org).
  - Response: `Event[]` sorted by `event_date DESC`.

- GET `/events/:id`
  - Purpose: Fetch specific event by id.
  - 200: Event row; 404 if not found.

- GET `/events/:id/seats`
  - Purpose: Seat map for the event.
  - Response: `{ total: number, taken: number[] }` with sorted taken seats.

- PUT `/events/:id`
  - Purpose: Update event metadata (and capacity if `total_slots` changed).
  - Body: Partial fields: `{ name?, description?, category?, event_date?, total_slots? }`
  - Side effects: If `total_slots` provided, `SET event:{id}:slots = total_slots`.

- DELETE `/events/:id`
  - Purpose: Delete event and associated Redis key.
  - Side effects: `DEL event:{id}:slots`.

### Bookings

- POST `/bookings`
  - Purpose: Create a booking transactionally with concurrency control.
  - Body: `{ event_id: UUID, user_id: UUID, seats: number, seat_numbers?: number[] }`
  - Behavior:
    - Try `DECRBY event:{event_id}:slots`.
    - If `< 0` → revert `INCRBY`, set status `waiting`, append user to `event:{event_id}:waitlist` with `RPUSH`, include `waiting_number`.
    - If `>= 0` → set status `confirmed`, allocate seats:
      - Respect requested seats if all free; else auto‑assign lowest available seat numbers.
      - Insert into `booking_seats`.
      - Decrease `events.available_slots`.
    - Publish RabbitMQ notification type: `booking_confirmed` or `booking_waitlisted`.
  - Responses: 201 booking row; 500 on error.

- GET `/bookings/user/:userId`
  - Purpose: Fetch a user’s bookings with joined event details.

- POST `/bookings/:id/cancel`
  - Purpose: Cancel entire booking; free seats; promote waitlist per freed seat.
  - Behavior:
    - Mark `bookings.status = 'cancelled'`.
    - Free `booking_seats` and count seats freed.
    - `INCRBY` Redis slots and `UPDATE events.available_slots`.
    - For each seat freed, `LPOP` waitlist; promote earliest waiting booking, allocate one seat number, decrease `available_slots` accordingly; publish `waitlist_promoted`.

- POST `/bookings/:id/cancel-seats`
  - Purpose: Cancel selected seats within a booking; promote waitlist seat‑by‑seat.
  - Body: `{ seat_numbers: number[] }`

### Organizations and Users (high level)

- Users: `GET /users?keycloak_id=:sub`, `POST /users` to upsert user on first login.
- Organizations: `GET /organizations`, `GET /organizations/user/:userId`, `GET /organizations/:id/members`.
- Invites: `POST /org-invites`, `GET /org-invites/:token` (acceptance flow handled in UI).

## Error Handling and Status Codes

- 400 Bad Request: invalid inputs (e.g., missing `seat_numbers` for cancel‑seats).
- 401/403: unauthorized/forbidden via Keycloak and role checks.
- 404 Not Found: missing entity.
- 409 Conflict: (future) seat conflict or version mismatch.
- 429 Too Many Requests: (future) rate limiting.
- 500 Internal Server Error: unexpected exceptions or unavailable dependencies.

Response model for errors: `{ error: string }`. Log correlation IDs can be added via middleware in future.

## Data Model Details

- `events`:
  - `total_slots` is authoritative capacity; `available_slots` mirrors free seats and is updated transactionally with Redis counters.
  - `status` reflects lifecycle (`upcoming` → `ongoing` → `completed` or `cancelled`).
- `bookings`:
  - `status`: `confirmed`, `waiting`, `cancelled`.
  - `waiting_number`: position at the time of enqueue; actual order enforced by Redis list.
- `booking_seats`:
  - Unique index `(event_id, seat_no)` for `status='booked'` prevents double allocation.
  - Allows future visualization per seat.
- `organization_users`:
  - Role enumerations: `orgAdmin`, `organizer`, `user`.

## Redis Keyspace and Semantics

- `event:{eventId}:slots` → integer counter of remaining capacity
  - On booking request: `DECRBY seats` then (if needed) revert.
  - On cancellation or seat release: `INCRBY count`.
- `event:{eventId}:waitlist` → list of user IDs (string)
  - Enqueue: `RPUSH` on overflow
  - Dequeue: `LPOP` on promotion

Operational notes:
- Keys are created and updated by event creation and booking flows.
- For cold starts, the API sets counters from event creation (`POST /events`).

## RabbitMQ Topology

- Queue: `notifications` (durable)
- Producers: API (bookings route)
- Consumers: `server/workers/notificationsWorker.js`
- Messages: JSON `{ type, eventId, userId, seats? }`
- Semantics: At‑least‑once; consumer must be idempotent.

## Security and Authorization

- Authentication via Keycloak; tokens propagated to API.
- UI enforces visibility based on org role; backend must also enforce authorization per route.
- Session: express‑session with memory store in dev; external store recommended in production.
- Secrets: environment variables for Redis/RabbitMQ/DB.

## Performance and Concurrency

- Hot path: booking creation. Redis handles contention with atomic ops; Postgres receives transactional writes for bookings and seats.
- Typical latencies:
  - Redis ops: sub‑millisecond.
  - Postgres insert/update: low milliseconds under moderate load.
  - RabbitMQ publish: asynchronous; not on the critical path for user confirmation.
- Scaling knobs:
  - API horizontal scaling: stateless; share Redis and Postgres.
  - Worker scaling: increase consumers of `notifications` queue.
  - Database: add indexes (already present on foreign keys, event dates, roles) and consider read replicas for heavy reads.

## Reliability, SLOs, and Back‑Pressure

- Booking confirmation path remains available if RabbitMQ is down (notifications become best‑effort and can be retried later).
- If Redis is down, bookings cannot confirm or waitlist; system fails fast with 500 to avoid data corruption.
- Suggested SLOs (example):
  - Availability: 99.9% for booking APIs.
  - P95 booking latency: < 250 ms under 200 RPS.
  - Notification delivery: 99% within 60 seconds.

## Logging, Metrics, and Tracing (Recommended)

- Logging: structured logs per request with correlation ID.
- Metrics: counters for bookings created, waitlist promotions, cancellations; gauges for `available_slots` reconciliation.
- Tracing: instrument Redis/Postgres calls for end‑to‑end latency.

## Deployment and Environments

- Local: Docker Compose services (Keycloak, Postgres, Redis, RabbitMQ).
- Dev/QA: same stack; ensure external session store and persistent volumes.
- Production (recommended):
  - Managed Postgres; Redis (HA) with persistence; RabbitMQ cluster; Keycloak managed or hosted.
  - API/Worker in container orchestrator (Kubernetes/ECS) with health checks.

## Configuration Reference

- API
  - `PORT` (default 5000)
  - `DATABASE_URL` or pool settings in `server/config/db.js`
  - `REDIS_URL` (default `redis://redis:6379`)
  - `RABBITMQ_URL` (default `amqp://happening:happening@rabbitmq:5672`)
  - Keycloak realm/client settings via middleware and environment
- Client
  - Keycloak realm/client/base URL in `client/lib/keycloak.js`

## Operational Runbooks

Incident: Many bookings failing with 500
- Check Redis health. If down, restore service; bookings depend on Redis atomic counters.
- Verify Postgres connectivity via `/db-test`.
- Inspect API logs for stack traces and failing route.

Incident: Notifications not being delivered
- Check RabbitMQ UI at `:15672` for queue depth and consumer health.
- Ensure worker is running (`npm run worker:notifications`).
- If messages are stuck, check worker logs and connection string.

Incident: Seat duplication detected (should not happen)
- Verify `booking_seats` unique index exists and not disabled.
- Cross‑check Redis counters vs `events.available_slots`; reconcile via admin script if needed.

## Data Integrity and Idempotency

- Event creation is idempotent on the DB; Redis counter is overwritten by design when total changes.
- Booking creation is not retried blindly by the API; clients should avoid duplicate posts or include client‑side idempotency keys in a future enhancement.
- Waitlist promotion loop is transactional per seat promotion.

## Testing Strategy

- Unit tests (recommended):
  - Seat allocation function given a taken set should assign lowest available numbers.
  - Waitlist enqueue/dequeue semantics around edge cases.
- Integration tests (recommended):
  - Concurrent booking attempts should never oversell seats; overflow goes to waitlist.
  - Cancellation promotes the earliest waiting booking and assigns a seat.
- Manual test scripts:
  - Create event (capacity 5). Open two browser sessions, book 3 and 3; ensure 1 is waitlisted.
  - Cancel 2 seats from the 3‑seat booking; confirm two waitlisted seats are promoted.

## Troubleshooting Checklist

- Keycloak: cannot log in
  - Verify Keycloak container health and realm/client configuration.
  - Check CORS settings; frontend origin must be allowed.
- API CORS errors
  - Confirm `cors()` config in `server/index.js` includes the frontend origin.
- DB migration/schema errors
  - Ensure `ensureSchema()` runs on startup; review logs for SQL errors.
- Redis timeouts
  - Check network/firewall; test `redis-cli -h redis -p 6379 PING`.

## Security Considerations and Hardening

- Token validation: ensure all protected routes verify JWT and roles.
- Session store: avoid memory store in production; use Redis or another durable store.
- Input validation and sanitization on all POST/PUT routes.
- Principle of least privilege for DB user and RabbitMQ vhost.

## Capacity Planning (Example Assumptions)

- Events: up to 10k concurrent active events.
- Bookings: up to 500 RPS peak during drops.
- Redis: memory sized for counters and modest waitlists; persistence AOF enabled.
- RabbitMQ: single queue with consumer autoscaling.

## Roadmap and Future Work

- Real‑time seat map updates via Socket.IO broadcasts.
- Role‑based API guards and comprehensive ACL checks.
- Payment integration for paid events; refund flows.
- ICS calendar exports and reminders.
- Analytics: conversion funnels, waitlist promotion rates.
- Admin tooling to reconcile counters and run audits.

## Glossary

- Booking: A user’s request for one or more seats for an event.
- Seat Allocation: Assigning specific seat numbers to a booking.
- Waitlist: Queue of users waiting for seats when an event is at capacity.
- Promotion: Moving a waitlisted booking to confirmed when a seat becomes available.

## Demo Scripts (Copy‑Paste)

Create an event (via UI Create Event modal) then:
- Book 2 seats; verify confirmation.
- In another user session, book `total_slots` to trigger waitlist.
- Cancel one seat on the first booking; verify the other user is promoted.

## Non‑Functional Requirements Coverage

- Reliability: Designed for safe concurrency and eventual consistency between Redis and Postgres.
- Scalability: Stateless API/worker, shared Redis/DB.
- Observability: Clear surfaces to instrument; RabbitMQ/Redis UIs available.
- Security: Keycloak‑backed auth; roles drive visibility and access.

## File‑by‑File Highlights

- `server/index.js`: App bootstrap, Keycloak middleware, Socket.IO, schema init, route mounts.
- `server/routes/events.js`: Event CRUD, seat map, Redis counter init/update, delete cleanup.
- `server/routes/bookings.js`: Booking creation with Redis DECRBY, seat allocation, cancellation with waitlist promotion, partial seat cancellation.
- `server/sql/schema.sql`: Full DDL, indexes, idempotent triggers.
- `client/pages/media.js`: Dashboard UX, seat selection modal, manage seats, organizer workflows.
- `client/pages/_app.js`: Keycloak lifecycle, token refresh hook, layout.
- `docker/docker-compose.yml`: Keycloak/Postgres/Redis/RabbitMQ and worker service.

## Risks and Mitigations

- Risk: Redis key and Postgres counts diverge under rare failures → Mitigation: periodic reconciliation task (future), protective `GREATEST()` and transactional updates applied now.
- Risk: Notification backlog grows → Mitigation: scale workers; set dead‑lettering (future).
- Risk: Overly permissive CORS or tokens → Mitigation: tighten config and add tests.

## Compliance and Data Retention (Guidance)

- PII: user names/emails in `users` and `organization_invites`.
- Retention policy: define per org (future). Provide data export/delete endpoints for compliance (future).

## Frequently Asked Questions

- Why Redis and not just Postgres row‑level locks?
  - Redis atomic counters reduce contention and simplify logic under heavy concurrency; Postgres remains the source of truth.
- What happens if two users select the same seat numbers?
  - If conflicts are detected, the system auto‑assigns the lowest available seats instead of failing.
- Can users transfer seats?
  - Not currently; cancellation and rebooking are supported.

## Change Management

- All schema changes go through `server/sql/schema.sql` and idempotent DDL in services.
- Backwards compatibility is maintained by `IF NOT EXISTS` constructs and defensive code.

## Extensibility Points

- Add webhooks on booking events.
- Plug in email/SMS providers in the notifications worker.
- Enhance seat maps with zones/rows and pricing tiers.

## End‑to‑End Example (Happy Path)

1) Organizer creates an event: `total_slots=10`.
2) User A opens seat map, selects seats 1 and 2 → confirmed; receives notification.
3) User B books 9 seats → waitlisted (only 8 left after User A’s booking).
4) User A cancels 1 seat → User B is promoted for 1 seat; receives notification.

## End‑to‑End Example (Edge Cases)

- Race: Two users try to book remaining seat simultaneously → one gets confirmed; the other goes to waitlist due to Redis atomicity.
- Partial cancel: User cancels specific seats; promotion occurs per seat.
- Event resize: Organizer increases `total_slots`; Redis counter is reset; bookings continue with new capacity.

## Operational Dashboards (Suggested)

- API: request rate, error rate, latency (P50/P95/P99).
- Bookings: confirmed vs waiting counts per event.
- Waitlist: queue length by event.
- Notifications: published, consumed, failed.

## Backup and Restore (Guidance)

- Postgres: regular logical backups; PITR for production.
- Redis: AOF persistence and snapshotting; restore keys if needed from event totals and `booking_seats`.
- RabbitMQ: non‑durable messages may be lost if not persisted; `notifications` is durable.

## Developer Tips

- Use `/db-test` to verify DB connectivity.
- To inspect seat allocation, query `booking_seats` ordered by `seat_no`.
- To view event availability, check `events.available_slots` and Redis `event:{id}:slots`.

## Known Limitations

- Roles are enforced primarily at the UI layer; server‑side enforcement should be extended.
- No payment flow; bookings are free.
- No email provider wired by default; worker logs simulate sending.

## Appendix: Sample Data Shapes

- Event (API): `{ id, org_id, name, description, category, event_date, total_slots, available_slots, status, created_at, updated_at }`
- Booking (API): `{ id, event_id, user_id, seats, status, waiting_number, created_at, updated_at }`
- Seat map: `{ total, taken: number[] }`

## Appendix: Environment Setup Notes

- Keycloak theme is mounted via `docker/keycloak-themes/happening`.
- Default Keycloak admin: `admin/admin` (dev only).
- RabbitMQ UI credentials: `happening/happening` (dev only).

## Conclusion

Happening delivers reliable, scalable event booking with clear separation of concerns, safe concurrency, and a pleasant UI. This document should enable managers, engineers, and operators to understand the why, what, and how—and to confidently demo, operate, and extend the system.


