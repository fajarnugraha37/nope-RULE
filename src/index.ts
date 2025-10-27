import { Hono } from 'hono';
import ruleSet from './dsl/onboarding_v1.json' assert { type: 'json' };
import { EngineManager } from './engine/engine';
import { registerRoutes } from './http/routes';
import { runMigrationsIfNeeded } from './sql/migrate';

await runMigrationsIfNeeded();

const engine = EngineManager.load(ruleSet);
const app = new Hono();

registerRoutes(app, engine);

const port = Number(process.env.PORT ?? 3000);

export default {
  fetch: app.fetch,
  port: port,
};

setInterval(() => {
  engine.processTimeouts().catch((err) => console.error('Timeout sweep error', err));
}, 30_000).unref?.();

console.log(`workflow engine listening on http://localhost:${port}`);
