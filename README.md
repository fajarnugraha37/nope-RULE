# Workflow Screening Engine (Bun + TypeScript)

This repository implements a workflow/screening engine with human-in-the-loop, event waits, and barrier fan-in using Bun 1.1+ and strict TypeScript.

## Quickstart
- `bun install`
- Provision Postgres and apply migrations: `psql "$DATABASE_URL" -f src/sql/001_tables.sql`
- `bun dev` (listens on `:3000`)

### Example walkthrough
```bash
curl -XPOST :3000/workflows/onboarding_v1/start -H 'content-type: application/json' \
  -d '{ "user": { "id": "u-1" }, "flags": {} }'

# submit form
curl -XPOST :3000/tasks/<taskId>/submit -H 'content-type: application/json' \
  -d '{ "fullName": "Ada", "email":"ada@ex.com" }'

# screening events
curl -XPOST :3000/events/check.kyc/u-1      -H 'content-type: application/json' \
  -d '{ "userId":"u-1","status":"PASS" }'
curl -XPOST :3000/events/check.sanction/u-1 -H 'content-type: application/json' \
  -d '{ "userId":"u-1","status":"PASS" }'
curl -XPOST :3000/events/check.device/u-1   -H 'content-type: application/json' \
  -d '{ "userId":"u-1","status":"PASS" }'
curl -XPOST :3000/events/check.credit/u-1   -H 'content-type: application/json' \
  -d '{ "userId":"u-1","score":720,"status":"PASS" }'
curl -XPOST :3000/events/check.risk/u-1     -H 'content-type: application/json' \
  -d '{ "userId":"u-1","status":"PASS","reason":"none" }'

# entity form
curl -XPOST :3000/tasks/<entityTaskId>/submit -H 'content-type: application/json' \
  -d '{ "entityType":"PERSONAL","documents":["doc-a.pdf"] }'

# payment
curl -XPOST :3000/events/payment.confirmed/u-1 -H 'content-type: application/json' \
  -d '{ "userId":"u-1","paymentId":"p-9","amount":100000 }'

# metrics
curl :3000/instances/<instanceId>
```

## Environment
- `DATABASE_URL` – Postgres connection string (postgres.js driver). If absent, the engine falls back to in-memory storage for development/tests.

## Tests
- `bun test` using Bun's native test runner.

## Notes
- Metrics (`wall_ms_total`, `active_ms_total`, `waiting_ms_total`) are persisted per workflow; per-node runs include attempts and waiting time.
- Barrier topics record per-topic timing; use SQL to compute aggregates (e.g. `SELECT percentile_disc(0.95) WITHIN GROUP (ORDER BY duration_ms) FROM workflow_barrier_topics;`).
- HTTP routes enforce `Idempotency-Key` for submits/events and validate payloads with AJV using `src/dsl/ajv-schemas.json`.
