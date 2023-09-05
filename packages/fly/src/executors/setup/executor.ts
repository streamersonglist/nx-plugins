import { getApp, setupIps } from '../../utils/fly';
import { SetupExecutorSchema } from './schema';
import { logger } from '@nx/devkit';

export default async function runExecutor(options: SetupExecutorSchema) {
  logger.debug('Executor ran for Setup', options);

  try {
    const app = await getApp(options.appName);
    if (app?.app?.regions) {
      for (const region of app.app.regions) {
        await setupIps({
          appName: options.appName,
          region: region.code,
          organizationId: app.app.organization.id,
          types:
            options.connection === 'private'
              ? ['private_v6']
              : ['shared_v4', 'v6'],
        });
      }

      return {
        success: true,
      };
    }

    logger.error('No regions found for app');
    return {
      success: false,
    };
  } catch (error) {
    logger.error(error);
    return {
      success: false,
    };
  }
}
