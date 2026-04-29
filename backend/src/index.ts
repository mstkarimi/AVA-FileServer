import express from 'express';
import { config } from './config';
import { initDb } from './db';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './logger';
import authRouter from './routes/auth';
import filesRouter from './routes/files';
import sharesRouter from './routes/shares';
import previewRouter from './routes/preview';
import publicRouter from './routes/public';
import usersRouter from './routes/users';
import searchRouter from './routes/search';

const app = express();

app.disable('x-powered-by');
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.set('trust proxy', 1);

// Routes
app.use('/api/auth', authRouter);
app.use('/api/files', filesRouter);
app.use('/api/shares', sharesRouter);
app.use('/api/preview', previewRouter);
app.use('/api/admin/users', usersRouter);
app.use('/api/search', searchRouter);
app.use('/s', publicRouter);

// 404 for unknown API routes
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
});

app.use(errorHandler);

initDb();

app.listen(config.port, '127.0.0.1', () => {
  logger.info({ port: config.port }, 'File server started');
});
