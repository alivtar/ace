import app from './app';
import config from './configs/env';
import logger from './configs/logger';

app.listen(config.PORT, () => {
  logger.info(`App started on port ${config.PORT}`);
});
