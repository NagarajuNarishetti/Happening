## Key Design Decisions & Trade‑offs

### PostgreSQL + Redis Split

- Decision: PostgreSQL as source of truth; Redis for counters/queues/locks.
- Trade‑off: Dual write surfaces require reconciliation logic; benefits include high throughput seat ops.

### RabbitMQ for Notifications

- Decision: Durable, observable queue with worker consumers.
- Trade‑off: Extra infra; enables retries, DLQs, and backpressure handling.

### Keycloak for Auth

- Decision: Externalize IAM to a battle‑tested solution.
- Trade‑off: Additional component to configure and operate; drastically reduces auth complexity.

### Socket.IO for Realtime

- Decision: Pragmatic websockets with rooms and fallbacks.
- Trade‑off: Tight coupling to Node runtime; simple and effective for this use case.

### Multi‑Tenancy Model

- Decision: Single database with `org_id` scoping, application‑level RBAC.
- Trade‑off: Strong guardrails in code; simpler ops than full DB‑per‑tenant.


