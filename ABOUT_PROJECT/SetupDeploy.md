## Setup & Deployment

### Prerequisites

- Node.js 18+
- Docker Desktop (for local services)

### Local Development

1. Start infra services:
   - `docker/docker-compose.yml` brings up PostgreSQL, Redis, RabbitMQ, and Keycloak.
2. Configure environment variables in `server/env.txt` (copy to `.env` as needed).
3. Install deps:
   - From repo root: `npm install` (or install separately in `client/` and `server/`).
4. Run backend:
   - `cd server && npm run dev` (or `npm start`).
5. Run frontend:
   - `cd client && npm run dev` then open http://localhost:3000.

### Database

- Apply schema from `server/sql/schema_improved.sql` (or use provided migrations).

### Keycloak

- Import a realm or configure a new one matching `client/lib/keycloak.js` and `server/config/keycloak.js` settings.

### Notifications Worker

- Start RabbitMQ consumer: `node server/workers/notificationsWorker.js` (or npm script).

### Deployment (Overview)

- Containerize client and server; provision managed PostgreSQL/Redis/RabbitMQ or self‑hosted clusters.
- Use Kubernetes for scaling; expose services via Ingress; secure with TLS.
- Automate CI/CD (e.g., GitHub Actions) for build/test/deploy.


