# Backend Guide

## Overview
Node.js (Express) serves REST endpoints and coordinates PostgreSQL, Redis, and RabbitMQ.

## Key modules
- DB: `server/config/db.js`
- Redis: `server/config/redis.js`
- RabbitMQ: `server/config/rabbitmq.js`
- Key routes: `server/routes/*.js`

## Routes
- Users: `server/routes/users.js`
- Organizations: `server/routes/organizations.js`
- Organization Invites: `server/routes/orgInvites.js`
- Events: `server/routes/events.js`
- Bookings: `server/routes/bookings.js`
- Notifications: `server/routes/notifications.js`

## Seat allocation & waitlist (Redis + Postgres)
- Create booking:
  - `DECRBY event:{eventId}:slots` to reserve slots atomically
  - If negative → revert and `RPUSH event:{eventId}:waitlist` with userId
  - If confirmed → assign seats in `booking_seats` and update `events.available_slots`
- Cancel booking:
  - Free seats in `booking_seats`, increment slots, and promote from waitlist (`LPOP`)

## Notifications (RabbitMQ)
- API publishes events to `notifications` queue on booking create/promotion.
- Worker `server/workers/notificationsWorker.js` consumes and logs/sends notifications.

## Schema
- See `server/sql/schema.sql` for tables: `events`, `bookings`, `booking_seats`, `booking_history`, `notifications`.
