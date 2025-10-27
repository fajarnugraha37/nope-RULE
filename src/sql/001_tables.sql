CREATE TABLE IF NOT EXISTS workflow_instances (
  id TEXT PRIMARY KEY,
  flow_name TEXT NOT NULL,
  status TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  wall_ms_total BIGINT DEFAULT 0,
  active_ms_total BIGINT DEFAULT 0,
  waiting_ms_total BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS workflow_instances_status_idx ON workflow_instances (status);

CREATE TABLE IF NOT EXISTS workflow_state_runs (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt INT NOT NULL DEFAULT 1,
  waiting BOOLEAN NOT NULL DEFAULT FALSE,
  duration_ms BIGINT DEFAULT 0,
  active_ms BIGINT DEFAULT 0,
  waiting_ms BIGINT DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS workflow_state_runs_instance_idx
  ON workflow_state_runs (instance_id, node_id);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  schema_ref TEXT NOT NULL,
  status TEXT NOT NULL,
  assignees TEXT[] NOT NULL DEFAULT '{}',
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks (status);
CREATE INDEX IF NOT EXISTS tasks_assignee_idx ON tasks USING GIN (assignees);

CREATE TABLE IF NOT EXISTS workflow_barriers (
  instance_id TEXT NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  correlate_key TEXT NOT NULL,
  mode TEXT NOT NULL,
  quorum INT,
  expected_topics TEXT[] NOT NULL DEFAULT '{}',
  emit_merged BOOLEAN DEFAULT FALSE,
  progress JSONB NOT NULL,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (node_id, correlate_key)
);

CREATE INDEX IF NOT EXISTS workflow_barriers_instance_idx
  ON workflow_barriers (instance_id, node_id);

CREATE TABLE IF NOT EXISTS workflow_barrier_topics (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  duration_ms BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS workflow_barrier_topics_idx
  ON workflow_barrier_topics (instance_id, node_id, topic);
