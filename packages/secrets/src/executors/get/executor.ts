import { logger } from '@nrwl/devkit';
import { getSecrets } from '../../utils/ssm';
import { GetExecutorSchema } from './schema';

export default async function runExecutor(options: GetExecutorSchema) {
  logger.debug('Executor ran for get', options);

  try {
    await getSecrets(options);
  } catch (error) {
    logger.error((error as Error).message);
    return { success: false };
  }

  return { success: true };
}
