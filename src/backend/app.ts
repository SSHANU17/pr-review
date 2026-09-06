import express from 'express';
import { apiRouter } from './routes/api.routes';

export function createBackendApp() {
  const app = express();

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Mount API Sub-router
  app.use('/api', apiRouter);

  return app;
}
