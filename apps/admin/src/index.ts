import { Hono } from 'hono';

type Bindings = {
  readonly ENVIRONMENT: 'dev' | 'prd';
};

const app = new Hono<{ Bindings: Bindings }>();

app.get('/health', (c) => c.json({ status: 'ok', environment: c.env.ENVIRONMENT }));

export default app;
