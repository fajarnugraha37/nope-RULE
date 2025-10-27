import { Hono } from 'hono';
import ruleSet from './dsl/onboarding_v1.json' assert { type: 'json' };
import { EngineManager } from './engine/engine';
import { registerRoutes } from './http/routes';
import { runMigrationsIfNeeded } from './sql/migrate';
import { resolveStorageFromEnv } from './engine/storage';

await runMigrationsIfNeeded();
const storage = await resolveStorageFromEnv();
const manager = new EngineManager(storage);
manager.registerRuleSet(ruleSet);

const app = new Hono();
registerRoutes(app, manager);

const port = Number(process.env.PORT ?? 3000);

setInterval(() => {
  for (const instance of manager.engines.values()) {
    instance.processTimeouts().catch((err) => console.error('Timeout sweep error', err));
  }
}, 30_000).unref?.();

export default {
  fetch: app.fetch,
  port
};

console.log(`workflow engine listening on http://localhost:${port}`);
