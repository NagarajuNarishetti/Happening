## How It Works (End‑to‑End)

This document explains key user flows and the underlying mechanisms.

### Event Creation (Organizer)

1. Organizer defines event details (name, time, capacity) in `client/` UI.
2. Backend persists event in PostgreSQL.
3. Organizer sees the event in the dashboard; users see it if published.

### Booking Seats (User)

1. User selects seats on the realtime seat map.
2. Client emits selection to Socket.IO room; others see held seats.
3. Backend attempts booking:
   - Acquire Redis short‑TTL lock `booking:{eventId}:{userId}`.
   - Atomically decrement `event:{eventId}:slots` by N.
   - If result ≥ 0, mark booking as `confirmed` in PostgreSQL.
   - If result < 0, revert decrement and create `waiting` booking with `waiting_number`.
4. Create booking_history entry.
5. Notify via RabbitMQ (confirmed/waitlisted).

### Cancellation & Waitlist Promotion

1. On cancel, increment `event:{eventId}:slots`.
2. Pop next user from `event:{eventId}:waitlist` (FCFS).
3. Update their booking to `confirmed` in PostgreSQL.
4. Record history and push promotion notification to RabbitMQ.
5. Broadcast realtime updates to the event room.

### Notifications Processing

1. API produces notification jobs to RabbitMQ with payload (user, template, context).
2. Worker (`server/workers/notificationsWorker.js`) consumes, sends provider calls, updates `notifications` table with status.

### Roles & Permissions

- orgAdmin: manage org, members, and settings.
- organizer: create/manage events.
- user: browse and book events.

### Data Model (Summary)

- users, organizations, organization_users
- events, bookings, booking_history
- notifications, org_invites

For table details, see SQL files in `server/sql/`.


