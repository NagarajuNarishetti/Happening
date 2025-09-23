# Happening - Architecture Overview

This document describes how the Happening platform is put together and how data flows through it.

## High-level components
- Client (Next.js): authenticated UI with Keycloak. Pages for events, organizations, and switching org context.
- API (Node.js/Express): REST for users, organizations, events, bookings, notifications.
- PostgreSQL: source of truth for all entities, including per-seat allocations.
- Redis: atomic counters for event slots and waitlist queues.
- RabbitMQ: async notifications pipeline consumed by a worker.
- Keycloak: identity provider and access control.

## Key data flows
### Create booking
1. API attempts to decrement Redis key `event:{eventId}:slots` with DECRBY.
2. If result >= 0, booking is confirmed; seats are assigned in `booking_seats`, and `events.available_slots` is decreased.
3. If result < 0, the decrement is reverted and the user is appended to `event:{eventId}:waitlist`.
4. API publishes a RabbitMQ message `booking_confirmed` or `booking_waitlisted`.

### Cancel booking and promote waitlist
1. API increases `event:{eventId}:slots` and `events.available_slots`.
2. Pops next user from `event:{eventId}:waitlist` and promotes their booking, assigning the next available seat.
3. Publishes `waitlist_promoted` notification.

## Multi-tenancy and roles
- Users belong to organizations with roles: orgAdmin, organizer, user.
- UI can be filtered to a single org via `/switch/[id]`.
- Role controls which sections are shown (organizer can manage events; user can book).

## Important tables
- events (org_id, total_slots, available_slots, ...)
- bookings (event_id, user_id, seats, status, waiting_number)
- booking_seats (event_id, booking_id, user_id, seat_no, status)
- booking_history (booking_id, action, details)
- notifications (user_id, event_id, type, message, status)

## Source locations
- Client pages: `client/pages/media.js`, `client/pages/switch/[id].js`, `client/pages/organizations.js`.
- API routes: `server/routes/events.js`, `server/routes/bookings.js`, `server/routes/organizations.js`, `server/routes/orgInvites.js`, `server/routes/users.js`, `server/routes/notifications.js`.
- Integration: `server/config/redis.js`, `server/config/rabbitmq.js`, worker `server/workers/notificationsWorker.js`.
