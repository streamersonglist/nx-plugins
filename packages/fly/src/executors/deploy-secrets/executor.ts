import { logger } from '@nrwl/devkit';
import { deploySecrets } from '../../utils/fly';
import { DeploySecretsExecutorSchema } from './schema';

export default async function runExecutor(
  options: DeploySecretsExecutorSchema
) {
  if (options.verbose) {
    logger.debug('Executor ran for deploy-secrets', options);
  }

  try {
    await deploySecrets(options);
  } catch (error) {
    return {
      success: false,
    };
  }
  return {
    success: true,
  };
}
