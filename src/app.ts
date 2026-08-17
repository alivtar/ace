import express from 'express';
import router from './routes/v1';
import { errorConverter, errorHandler } from './middlewares/error';
import config from './configs/env';
import morgan from './configs/morgan';

const app = express();

if (config.env !== 'test') {
  app.use(morgan.successHandler);
  app.use(morgan.errorHandler);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/v1', router);

app.use(errorConverter);
app.use(errorHandler);

export default app;
