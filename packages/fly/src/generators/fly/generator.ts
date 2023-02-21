import {
  formatFiles,
  readProjectConfiguration,
  Tree,
  updateProjectConfiguration,
} from '@nrwl/devkit';
import { join } from 'path';
import { FlyGeneratorSchema } from './schema';

export default async function (tree: Tree, options: FlyGeneratorSchema) {
  const projectConfig = readProjectConfiguration(tree, options.project);
  const sourceRoot = projectConfig.sourceRoot || '';

  const envFilePath = join(sourceRoot, options.envFile || '.env.secrets');
  const tomlFilePath = options.tomlFile || 'fly.toml';
  const dockerFilePath = 'Dockerfile';

  if (projectConfig.targets && !('deploy' in projectConfig.targets)) {
    projectConfig.targets['deploy'] = {
      executor: '@streamersonglist/fly:deploy',
      options: {
        appName: options.appName,
        tomlFile: tomlFilePath,
        dockerfile: dockerFilePath,
        organization: options.organization,
        regions: [options.primaryRegion],
      },
    };
  }

  if (projectConfig.targets && !('deploy-secrets' in projectConfig.targets)) {
    projectConfig.targets['deploy-secrets'] = {
      executor: '@streamersonglist/fly:deploy-secrets',
      options: {
        appName: options.appName,
        envFile: envFilePath,
        organization: options.organization,
        replaceAll: false,
        primaryRegion: options.primaryRegion,
      },
    };
  }

  updateProjectConfiguration(tree, options.project, {
    ...projectConfig,
    targets: projectConfig.targets,
  });

  await formatFiles(tree);
}
