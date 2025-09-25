## Security & Authentication

### Identity & Access Management

- Keycloak for OIDC/OAuth2: login, refresh tokens, user federation, social login (Google/GitHub).
- Roles:
  - orgAdmin: organization owner/administrator
  - organizer: event manager
  - user: attendee
- Tokens: Access token includes user identity; backend augments with org role from DB (`organization_users`).

### Session & Token Handling

- Frontend uses Keycloak JS adapter for silent refresh.
- Backend validates bearer tokens; enforces RBAC using both token claims and DB role checks.

### Multi‑Tenancy Boundaries

- Every resource is scoped by `org_id`.
- Authorization middleware ensures users operate within the active org.

### Data Protection & Privacy

- Store minimal PII (email, display name).
- Audit trail for bookings and membership events.

### Transport & Storage Security

- TLS in transit (recommended in production).
- PostgreSQL with role‑based DB access.

### Threat Mitigations

- Duplicate actions: Redis short‑TTL locks for booking.
- Race conditions: atomic counters and server‑side validation.
- Replay/XSRF: OAuth2 flows + standard CSRF protections where session cookies are used.
- DDoS/Abuse: rate limiting at API gateway/load balancer (recommended).


