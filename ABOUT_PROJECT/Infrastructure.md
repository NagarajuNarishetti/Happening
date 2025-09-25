# Infrastructure & Local Environment

## Services (Docker Compose)
- PostgreSQL: `5432`
- Redis: `6379`
- RabbitMQ: `5672` (AMQP), `15672` (management UI)
- Keycloak: `8080`

See `docker/docker-compose.yml` for service definitions and environment variables.

## Running locally
- Start infra:
  - `cd docker && docker compose up -d`
- Backend API:
  - `cd ../server && npm install && npm run dev`
- Notifications worker:
  - `cd ../server && npm install && npm run worker:notifications`
- Frontend:
  - `cd ../client && npm install && npm run dev`

## RabbitMQ UI
- Visit `http://localhost:15672` (user: `happening`, pass: `happening`).

## Environment variables
- See `server/env.txt` for example values. Load with `.env` in `server/`.
