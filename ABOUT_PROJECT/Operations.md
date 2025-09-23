# Operations

## Starting services
- DB/Redis/RabbitMQ/Keycloak: `docker compose up -d` from `docker/`
- API: `cd server && npm run dev`
- Worker: `cd server && npm run worker:notifications`
- Frontend: `cd client && npm run dev`

## Common checks
- API health: `GET /` on server (shows Running)
- DB connectivity: `GET /db-test`
- Redis keys: `docker exec -it happening-redis redis-cli KEYS event:*`
- RabbitMQ queue: `notifications` in web UI

## Troubleshooting
- Bookings stuck waiting: check `event:{id}:slots` & `event:{id}:waitlist`
- Notifications not consumed: ensure worker running; check RabbitMQ queue consumers
- Keycloak login issues: confirm realm and client creds; restart container

## Scaling
- Run multiple workers (process more notifications): launch additional worker processes or scale container replicas.
