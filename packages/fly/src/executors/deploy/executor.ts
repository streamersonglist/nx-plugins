import { logger, Executor } from '@nrwl/devkit';
import { deploy } from '../../utils/fly';
import { DeployExecutorSchema } from './schema';

const runExecutor: Executor<DeployExecutorSchema> = async function(
  options,
  context,
) {
  if (options.verbose) {
    logger.debug('Executor ran for Deploy', options);
  }
  try {
    await deploy(options, context);
  } catch (error) {
    logger.error(error);
    return { success: false };
  }

  return {
    success: true,
  };
}

export default runExecutor;
