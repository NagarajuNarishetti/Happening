
Tables
- organizations
  - What: Tenant entities that own events and memberships.
  - Why: Multi‑tenancy boundary for data and access control.
  - How: Referenced by `events.org_id` and `organization_users.organization_id`. Optional `domain`, `settings`, `status` for governance.
- users
  - What: Platform users mirrored from Keycloak (`keycloak_id`).
  - Why: Local persistence for joins, reporting, and non‑auth attributes.
  - How: Referenced by `bookings.user_id`, `organization_users.user_id`, `organization_invites.invited_by` and `notifications.user_id`.
- organization_users
  - What: Membership and role per user per organization.
  - Why: Role‑based access (orgAdmin, organizer, user) and membership lifecycle.
  - How: Unique `(organization_id, user_id)`; optional `permissions` JSONB for fine‑grained flags.
- events
  - What: Bookable events with capacity and schedule.
  - Why: Core resource for bookings and seat allocation.
  - How: Holds `total_slots` and `available_slots`; `status` lifecycle. Indexed by `org_id` and `event_date`. Redis key `event:{id}:slots` mirrors capacity for atomic operations.
- bookings
  - What: A user’s reservation request for N seats on an event.
  - Why: Tracks confirmation vs waitlist status over time.
  - How: `status` in (`confirmed`,`waiting`,`cancelled`), optional `waiting_number` for initial position. Indexed by `event_id`, `user_id`.
- booking_seats
  - What: Per‑seat allocation records linking a booking to seat numbers.
  - Why: Guarantees no double allocation; enables seat‑map UI.
  - How: Unique index `(event_id, seat_no)` for `status='booked'`. On booking confirm, seats are assigned (requested or lowest available). On cancel, seats marked `cancelled`.
- booking_history
  - What: Append‑only audit trail of booking actions.
  - Why: Debugging, analytics, and compliance.
  - How: `action` in (`created`,`cancelled`,`promoted`), optional `details` JSONB for context.
- notifications
  - What: Outbox for user notifications (booking confirmed, waitlisted, etc.).
  - Why: Persisted record of sends; supports reconciliation with RabbitMQ worker.
  - How: `status` in (`pending`,`sent`,`failed`). Worker updates status upon delivery.
- organization_invites
  - What: Invitation tokens to onboard users to an organization with a role.
  - Why: Self‑service onboarding and least‑privilege assignment.
  - How: Unique `token`, `expires_at`, `status` in (`pending`,`accepted`,`expired`).

Relationships and constraints
- `events.org_id → organizations.id` (SET NULL on org delete) isolates orphan cleanup.
- `bookings.event_id → events.id` (CASCADE) ensures cleanup when events are removed.
- `bookings.user_id → users.id` enforces valid principals.
- `booking_seats.booking_id → bookings.id` and `booking_seats.event_id → events.id` keep seat allocations consistent.
- Check constraints on enums (roles, statuses) prevent invalid states.

Indexes (performance)
- `idx_events_org_id`, `idx_events_date` support org views and timelines.
- `idx_bookings_event_id`, `idx_bookings_user_id` optimize common lookups.
- Unique partial index on `booking_seats(event_id, seat_no) WHERE status='booked'` prevents double booking of a seat.

Triggers and timestamps
- Unified trigger function `update_updated_at_column()` keeps `updated_at` current across tables.
- Triggers are created idempotently to survive repeated bootstraps.

Redis interplay (why and how)
- Why: Use atomic counters and lists to avoid RDBMS contention at peak demand.
- How: `event:{id}:slots` decremented on booking attempt; if negative, revert and enqueue `userId` on `event:{id}:waitlist`. On cancellation, increment slots and promote from waitlist per freed seat.

Data integrity model
- Postgres is the source of truth for entities and seat allocations; Redis accelerates and serializes hot operations.
- `events.available_slots` is reconciled transactionally alongside seat changes; guarded with `GREATEST()` when decrementing.

