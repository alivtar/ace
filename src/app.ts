import express from 'express';
import router from './routes/v1';
import { errorConverter, errorHandler } from './middlewares/error';
import config from './configs/env';
import morgan from './configs/morgan';
import { createInstagramWebhookRouter } from './routes/webhooks/instagram.router';
import { buildWebhookDeps } from './pipeline/container';

const app = express();

if (config.env !== 'test') {
  app.use(morgan.successHandler);
  app.use(morgan.errorHandler);
}

// Mounted before the JSON parser: signature checks need the raw request bytes.
app.use('/webhooks/instagram', createInstagramWebhookRouter(buildWebhookDeps()));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/v1', router);

app.use(errorConverter);
app.use(errorHandler);

export default app;
