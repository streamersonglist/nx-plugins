import {
  formatFiles,
  generateFiles,
  names,
  offsetFromRoot,
  ProjectConfiguration,
  readProjectConfiguration,
  Tree,
  updateProjectConfiguration,
} from '@nrwl/devkit';
import * as path from 'path';
import { SecretsGeneratorSchema } from './schema';

interface NormalizedSchema extends SecretsGeneratorSchema {
  projectName: string;
  projectConfig: ProjectConfiguration;
  secretsJson: string;
}

function normalizeOptions(
  tree: Tree,
  options: SecretsGeneratorSchema
): NormalizedSchema {
  const projectName = options.project;
  const projectConfig = readProjectConfiguration(tree, projectName);

  if (!options.envFile.startsWith('.env')) {
    throw new Error(
      '"envFile" should begin with .env to be included in gitignore'
    );
  }

  return {
    ...options,
    projectName,
    projectConfig,
    secretsJsonFilename: options.secretsJsonFilename,
    secretsJson: path.join(
      projectConfig.root,
      `${options.secretsJsonFilename ?? 'secrets'}.json`
    ),
    envFile: path.join(projectConfig.root, options.envFile ?? '.env.secrets'),
  };
}

function addFiles(tree: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
    ...names(options.projectName),
    offsetFromRoot: offsetFromRoot(options.projectConfig.root),
    template: '',
  };
  generateFiles(
    tree,
    path.join(__dirname, 'files'),
    options.projectConfig.root,
    templateOptions
  );
}

export default async function (tree: Tree, options: SecretsGeneratorSchema) {
  const normalizedOptions = normalizeOptions(tree, options);
  const targetGetSecrets = 'get-secrets';
  const targetSetSecrets = 'set-secrets';

  if (targetGetSecrets in normalizedOptions.projectConfig.targets) {
    throw new Error(
      `Project "${normalizedOptions.projectName}" already has a ${targetGetSecrets} target.`
    );
  }
  if (targetSetSecrets in normalizedOptions.projectConfig.targets) {
    throw new Error(
      `Project "${normalizedOptions.projectName}" already has a ${targetSetSecrets} target.`
    );
  }

  updateProjectConfiguration(tree, normalizedOptions.projectName, {
    ...normalizedOptions.projectConfig,
    targets: {
      ...normalizedOptions.projectConfig.targets,
      [targetGetSecrets]: {
        executor: '@streamersonglist/secrets:get',
        options: {
          envFilePath: normalizedOptions.envFile,
          secretsJson: normalizedOptions.secretsJson,
          ssmPrefix: normalizedOptions.ssmPrefix,
          awsProfileName: normalizedOptions.awsProfileName,
        },
        outputs: ['{options.secretsJson}'],
      },
      [targetSetSecrets]: {
        executor: '@streamersonglist/secrets:set',
        options: {
          envFile: normalizedOptions.envFile,
          secretsJson: normalizedOptions.secretsJson,
          ssmPrefix: normalizedOptions.ssmPrefix,
          awsProfileName: normalizedOptions.awsProfileName,
        },
        outputs: ['{options.secretsJson}'],
      },
    },
  });
  addFiles(tree, normalizedOptions);
  await formatFiles(tree);
}
