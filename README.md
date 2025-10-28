# Rule Engine (Bun + TypeScript)

This repository implements a Rule engine with human-in-the-loop, event waits, and barrier fan-in using Bun 1.1+ and strict TypeScript.

## Quickstart
- copy `.env.example` -> `.env` and adjust as needed
- choose a storage backend (see Storage Options) and export the required environment variables
- `bun install`
- optionally run migrations up front with `bun run migrate` (they also execute on boot unless disabled)
- `bun dev` (listens on `:3000`)

### Example walkthrough
```bash
curl -XPOST :3000/workflows/onboarding_v1/start \
  -H 'content-type: application/json' \
  -H 'Idempotency-Key: start-001' \
  -d '{ "user": { "id": "u-1" }, "flags": {} }'

# submit form
curl -XPOST :3000/tasks/<taskId>/submit \
  -H 'content-type: application/json' \
  -H 'Idempotency-Key: form-001' \
  -d '{ "fullName": "Ada", "email":"ada@ex.com" }'

# screening events
curl -XPOST :3000/events/check.kyc/u-1 \
  -H 'content-type: application/json' \
  -H 'Idempotency-Key: check-kyc-001' \
  -d '{ "userId":"u-1","status":"PASS" }'
curl -XPOST :3000/events/check.sanction/u-1 \
  -H 'content-type: application/json' \
  -H 'Idempotency-Key: check-sanction-001' \
  -d '{ "userId":"u-1","status":"PASS" }'
curl -XPOST :3000/events/check.device/u-1 \
  -H 'content-type: application/json' \
  -H 'Idempotency-Key: check-device-001' \
  -d '{ "userId":"u-1","status":"PASS" }'
curl -XPOST :3000/events/check.credit/u-1 \
  -H 'content-type: application/json' \
  -H 'Idempotency-Key: check-credit-001' \
  -d '{ "userId":"u-1","score":720,"status":"PASS" }'
curl -XPOST :3000/events/check.risk/u-1 \
  -H 'content-type: application/json' \
  -H 'Idempotency-Key: check-risk-001' \
  -d '{ "userId":"u-1","status":"PASS","reason":"none" }'

# entity form
curl -XPOST :3000/tasks/<entityTaskId>/submit \
  -H 'content-type: application/json' \
  -H 'Idempotency-Key: form-entity-001' \
  -d '{ "entityType":"PERSONAL","documents":["doc-a.pdf"] }'

# payment
curl -XPOST :3000/events/payment.confirmed/u-1 \
  -H 'content-type: application/json' \
  -H 'Idempotency-Key: payment-001' \
  -d '{ "userId":"u-1","paymentId":"p-9","amount":100000 }'

# metrics
curl :3000/instances/<instanceId>
```

## Storage Options
- `memory` (default) keeps all workflow state in-process and requires no additional configuration; ideal for tests and ephemeral development runs.
- `postgres` persists state to Postgres; set `WORKFLOW_STORAGE=postgres` (or define `DATABASE_URL`) and supply a connection string.
- `pglite` uses the embedded `@electric-sql/pglite` engine; set `WORKFLOW_STORAGE=pglite` and point `PGLITE_DATA_PATH` at a writable directory if you want on-disk persistence (omitting the path keeps the database in-memory).

## Database Migrations
- Migrations run automatically at startup when `RUN_MIGRATIONS_ON_BOOT` is `true` (default).
- Trigger migrations manually with `bun run migrate` or `make migrate`; set `MIGRATION_PATH` to override the SQL file (defaults to `src/sql/001_tables.sql`).
- Postgres runs require `DATABASE_URL`; PGlite runs honour `PGLITE_DATA_PATH` if provided.

## Environment
- `WORKFLOW_STORAGE` - choose `memory`, `postgres`, or `pglite`; defaults to `memory` unless `DATABASE_URL` is defined.
- `DATABASE_URL` - Postgres connection string (postgres.js driver). Required when `WORKFLOW_STORAGE=postgres`.
- `PGLITE_DATA_PATH` - optional filesystem path for the embedded PGlite database; omitted value keeps data in-memory.
- `RUN_MIGRATIONS_ON_BOOT` - set to `false` to skip automatic migrations at startup (defaults to `true`).
- `MIGRATION_PATH` - absolute or relative path to the SQL migration file (defaults to `src/sql/001_tables.sql`).
- `PORT` - HTTP listen port (default `3000`). AJV schema bundle is validated at boot; missing/invalid schemas cause startup failure.

## Docker & Makefile
- `docker compose up -d` (or `make up`) brings up the API and Postgres (`docker compose logs -f app` to tail logs).
- `make migrate` executes the Bun migration runner against the configured backend.
- `make clean` tears down containers and volumes; `make docker-build` produces a production image via the included `Dockerfile`.

## Building for Distribution

This package builds both CommonJS and ES Modules with TypeScript definitions:

- **Build**: `bun run build` - Creates both CJS and ESM builds with type definitions
- **Watch mode**: `bun run build:watch` - Continuously builds both formats during development
- **Clean**: `bun run build:clean` - Removes the dist folder

### Package Structure

The built package supports both module systems:

```bash
dist/
├── cjs/          # CommonJS build
│   ├── package.json  # {"type":"commonjs"}
│   └── src/
│       ├── index.js
│       ├── index.d.ts
│       └── ...
└── esm/          # ES Modules build
    └── src/
        ├── index.js
        ├── index.d.ts
        └── ...
```

### Usage

```javascript
// CommonJS
const { main } = require('nope-rule');

// ES Modules
import { main } from 'nope-rule';
```

## Tests
- `bun test` using Bun's native test runner.

## Notes
- Metrics (`wall_ms_total`, `active_ms_total`, `waiting_ms_total`) are persisted per workflow; per-node runs include attempts and waiting time.
- Barrier topics record per-topic timing; use SQL to compute aggregates (e.g. `SELECT percentile_disc(0.95) WITHIN GROUP (ORDER BY duration_ms) FROM workflow_barrier_topics;`).
- HTTP routes enforce `Idempotency-Key` for all workflow mutations and validate payloads with AJV using `src/dsl/ajv-schemas.json`.
