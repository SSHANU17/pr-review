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

if (process.env['NODE_ENV'] !== 'test') {
  const port = process.env['PORT'] || 4000;
  const app = createBackendApp();
  app.listen(port, () => {
    console.log(`Backend review engine microservice running on http://localhost:${port}`);
  });
}
