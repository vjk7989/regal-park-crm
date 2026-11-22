import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { handleRequest } from './core';
import { nodeStore } from './store';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', (req: Request, res: Response) => {
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    const out = handleRequest(nodeStore, { method: req.method, path: req.path, query: req.query as Record<string, string | string[] | undefined>, body: req.body, token });
    res.status(out.status).json(out.body);
  });
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
