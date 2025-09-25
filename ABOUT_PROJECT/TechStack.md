## Tech Stack & Rationale

### Frontend

- Next.js: SSR/ISR for fast UX, routing, and SEO.
- Tailwind CSS: rapid, consistent styling.
- Socket.IO client: realtime seat map updates.
- Keycloak JS adapter: OIDC login flows, token refresh.

### Backend

- Node.js (Express‑style in `server/`): REST APIs and Socket.IO server for realtime.
- PostgreSQL: relational integrity, auditing, transactional guarantees.
- Redis: atomic counters for slots, waitlist list, dedupe locks.
- RabbitMQ: decoupled notification processing with workers.
- Keycloak: centralized AuthN/AuthZ, social login support.

### DevOps

- Docker Compose: local stack (PostgreSQL, Redis, RabbitMQ, Keycloak).
- Kubernetes (target): scaling and isolation per service.
- GitHub Actions (target): CI/CD for build/test/deploy.

### Why These Choices

- PostgreSQL + Redis: clear split of truth vs. concurrency control.
- RabbitMQ: durable, observable message handling for notifications.
- Keycloak: avoids building auth from scratch; solid RBAC and providers.
- Socket.IO: pragmatic realtime with rooms, fallbacks.


