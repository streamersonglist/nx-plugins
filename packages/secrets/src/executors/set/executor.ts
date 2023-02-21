import { logger } from '@nrwl/devkit';
import { putSecrets } from '../../utils/ssm';
import { SetExecutorSchema } from './schema';

export default async function runExecutor(options: SetExecutorSchema) {
  logger.debug('Executor ran for Set', options);

  try {
    await putSecrets(options);
  } catch (error) {
    logger.error((error as Error).message);
    return { success: false };
  }

  return { success: true };
}
