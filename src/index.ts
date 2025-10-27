import { serve } from 'hono/bun';
import { Hono } from 'hono';
import ruleSet from './dsl/onboarding_v1.json' assert { type: 'json' };
import { EngineManager } from './engine/engine';
import { registerRoutes } from './http/routes';

const engine = EngineManager.load(ruleSet);
const app = new Hono();

registerRoutes(app, engine);

const port = Number(process.env.PORT ?? 3000);

serve({
  fetch: app.fetch,
  port
});

setInterval(() => {
  engine.processTimeouts().catch((err) => console.error('Timeout sweep error', err));
}, 30_000).unref?.();

console.log(`workflow engine listening on http://localhost:${port}`);
