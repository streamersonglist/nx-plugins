import { Executor, ExecutorContext, logger } from '@nx/devkit';
import { runCli } from '../../utils/fly';
import { CliExecutorSchema } from './schema';

const runExecutor: Executor<CliExecutorSchema> = async (
  options: CliExecutorSchema,
  context: ExecutorContext
) => {
  if (options.verbose) {
    logger.debug('Executor ran for Cli', options);
  }
  try {
    await runCli(options, context);
    return {
      success: true,
    };
  } catch (error) {
    logger.error(error);
    return {
      success: false,
    };
  }
};

export default runExecutor;
