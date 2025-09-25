
# Happening Database Schema Documentation

## Overview

The Happening platform uses a multi-tenant PostgreSQL database schema designed for event booking and notification management. This schema supports role-based access control, seat allocation, waitlist management, and real-time notifications.

## Schema Files

- `schema.sql` - Original schema (backward compatible)
- `schema_improved.sql` - Enhanced schema with better normalization, constraints, and performance optimizations

## Core Tables

### Organizations (Tenants)
- **What**: Tenant entities that own events and memberships
- **Why**: Multi-tenancy boundary for data and access control
- **How**: Referenced by `events.org_id` and `organization_users.organization_id`. Optional `domain`, `settings`, `status` for governance
- **Key Features**: Domain-based identification, Keycloak integration, flexible settings via JSONB

### Users
- **What**: Platform users mirrored from Keycloak (`keycloak_id`)
- **Why**: Local persistence for joins, reporting, and non-auth attributes
- **How**: Referenced by `bookings.user_id`, `organization_users.user_id`, `organization_invites.invited_by` and `notifications.user_id`
- **Key Features**: SSO integration, profile storage, status management

### Organization Users (Membership)
- **What**: Membership and role per user per organization
- **Why**: Role-based access (orgAdmin, organizer, user) and membership lifecycle
- **How**: Unique `(organization_id, user_id)`; optional `permissions` JSONB for fine-grained flags
- **Roles**: orgAdmin (full management), organizer (event management), user (booking/participation)

### Events
- **What**: Bookable events with capacity and schedule
- **Why**: Core resource for bookings and seat allocation
- **How**: Holds `total_slots` and `available_slots`; `status` lifecycle. Indexed by `org_id` and `event_date`. Redis key `event:{id}:slots` mirrors capacity for atomic operations
- **Categories**: webinar, concert, hackathon, conference, workshop, meetup, other
- **Statuses**: upcoming, ongoing, completed, cancelled

### Bookings
- **What**: A user's reservation request for N seats on an event
- **Why**: Tracks confirmation vs waitlist status over time
- **How**: `status` in (`confirmed`,`waiting`,`cancelled`), optional `waiting_number` for initial position. Indexed by `event_id`, `user_id`
- **Constraints**: Max 50 seats per booking, waiting number only for waiting status

### Booking Seats
- **What**: Per-seat allocation records linking a booking to seat numbers
- **Why**: Guarantees no double allocation; enables seat-map UI
- **How**: Unique index `(event_id, seat_no)` for `status='booked'`. On booking confirm, seats are assigned (requested or lowest available). On cancel, seats marked `cancelled`
- **Key Features**: Individual seat tracking, double-booking prevention, seat map support

### Booking History
- **What**: Append-only audit trail of booking actions
- **Why**: Debugging, analytics, and compliance
- **How**: `action` in (`created`,`cancelled`,`promoted`,`modified`), optional `details` JSONB for context
- **Key Features**: Immutable audit log, flexible details storage

### Notifications
- **What**: Outbox for user notifications (booking confirmed, waitlisted, etc.)
- **Why**: Persisted record of sends; supports reconciliation with RabbitMQ worker
- **How**: `status` in (`pending`,`sent`,`failed`,`delivered`). Worker updates status upon delivery
- **Types**: booking_confirmed, booking_waitlisted, booking_cancelled, waitlist_promoted, event_updated, event_cancelled, event_reminder

### Organization Invites
- **What**: Invitation tokens to onboard users to an organization with a role
- **Why**: Self-service onboarding and least-privilege assignment
- **How**: Unique `token`, `expires_at`, `status` in (`pending`,`accepted`,`expired`,`revoked`)
- **Key Features**: Token-based system, expiration management, role pre-assignment

## Database Design Principles

### 1. Multi-Tenancy
- Organizations act as tenant boundaries
- Data isolation through `org_id` foreign keys
- Role-based access control per organization

### 2. Data Integrity
- Comprehensive check constraints
- Foreign key relationships with appropriate CASCADE/SET NULL actions
- Unique constraints to prevent duplicate allocations
- Audit trails for all critical operations

### 3. Performance Optimization
- Strategic indexing for common query patterns
- Partial indexes for filtered queries
- Views for complex aggregations
- Automatic timestamp updates via triggers

### 4. Scalability
- UUID primary keys for distributed systems
- JSONB for flexible metadata storage
- Redis integration for high-concurrency operations

## Relationships and Constraints

### Foreign Key Relationships
- `events.org_id → organizations.id` (SET NULL on org delete) isolates orphan cleanup
- `bookings.event_id → events.id` (CASCADE) ensures cleanup when events are removed
- `bookings.user_id → users.id` enforces valid principals
- `booking_seats.booking_id → bookings.id` and `booking_seats.event_id → events.id` keep seat allocations consistent
- Check constraints on enums (roles, statuses) prevent invalid states

### Data Validation
- Email format validation using regex patterns
- Phone number format validation (E.164 standard)
- Domain format validation for organizations
- Business rule constraints (e.g., available slots ≤ total slots)

## Performance Optimizations

### Strategic Indexes
- **Primary Indexes**: All primary keys (UUID) and foreign key relationships
- **Performance Indexes**: 
  - `idx_events_date_status` - Event timeline queries
  - `idx_bookings_event_id` - Event booking lookups
  - `idx_notifications_pending` - Notification processing
  - `idx_organization_users_active` - Active membership queries
- **Partial Indexes**:
  - `idx_booking_seats_unique` - Prevents double booking
  - `idx_notifications_pending` - Only pending notifications
  - `idx_organization_users_active` - Only active memberships

### Views for Complex Queries
- **Event Booking Summary**: Aggregated statistics for events
- **User Booking Summary**: User-specific booking statistics

### Utility Functions
- `get_event_available_slots(event_uuid)` - Calculate available slots
- `update_event_available_slots()` - Trigger function for slot updates
- `update_updated_at_column()` - Automatic timestamp updates

## Redis Integration

### Purpose
Redis is used for high-concurrency operations to avoid database contention:

- **Atomic Counters**: `event:{id}:slots` for capacity management
- **Waitlist Queues**: `event:{id}:waitlist` for FIFO processing
- **Session Management**: User session data
- **Caching**: Frequently accessed data

### Data Consistency
- PostgreSQL remains the source of truth
- Redis operations are reconciled with database transactions
- Failed Redis operations trigger database rollback

## Migration Strategy

### Backward Compatibility
The improved schema maintains full backward compatibility:

1. **Additive Changes**: New columns, indexes, and constraints
2. **Conditional Creation**: `IF NOT EXISTS` for all new objects
3. **Safe Constraints**: Check constraints that don't affect existing data
4. **Gradual Migration**: Can be applied to existing databases safely

### Migration Steps
1. Apply `schema_improved.sql` to existing database
2. Verify all constraints and indexes are created
3. Test application functionality
4. Monitor performance improvements
5. Consider data cleanup if needed

## Key Improvements in Enhanced Schema

### Enhanced Constraints
- **Format Validation**: Email, phone, domain format checks
- **Business Rules**: Seat limits, date validation, status consistency
- **Data Integrity**: Non-empty strings, positive numbers, logical relationships

### Additional Indexes
- **Status-based Indexes**: For filtering by status across all tables
- **Composite Indexes**: For common query patterns
- **Partial Indexes**: For filtered queries (active users, pending notifications)

### New Features
- **Enhanced Categories**: Added conference, workshop, meetup, other
- **Additional Notification Types**: event_cancelled, event_reminder
- **Improved Audit Trail**: Added 'modified' action to booking history
- **Better Status Tracking**: Added 'delivered' status for notifications

### Performance Enhancements
- **Automatic Slot Updates**: Triggers to maintain available_slots accuracy
- **Optimized Views**: Pre-computed aggregations for common queries
- **Better Indexing**: Strategic indexes for all common query patterns

## Best Practices

### Query Optimization
- Use appropriate indexes for common query patterns
- Leverage views for complex aggregations
- Consider query execution plans for large datasets

### Data Management
- Regular cleanup of expired invitations
- Archive old booking history
- Monitor notification delivery rates

### Security
- Use parameterized queries to prevent SQL injection
- Implement proper access control at application level
- Regular security audits of database permissions

### Monitoring
- Track query performance
- Monitor index usage
- Alert on constraint violations
- Monitor Redis synchronization

