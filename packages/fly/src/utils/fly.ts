import { ExecutorContext, logger } from '@nx/devkit';
import { spawn } from 'child_process';
import { parse } from 'dotenv';
import { readFileSync } from 'fs';
import { ClientError, gql, request } from 'graphql-request';
import { join } from 'path';
import { CliExecutorSchema } from '../executors/cli/schema';

type AppPayload = {
  app: {
    status: string;
    regions: { code: string }[];
    organizations: { id: string };
  } | null;
};
type OrgPayload = {
  organizations: {
    nodes: { id: string; name: string }[];
  };
};

type CreateAppPayload = {
  createApp: { state: string } | null;
};

const FLY_URL = 'https://api.fly.io/graphql';

function getSecretsFromEnv(filePath: string): Record<string, string> {
  return parse(readFileSync(filePath));
}

function getFlyToken() {
  if ('FLY_API_TOKEN' in process.env && process.env['FLY_API_TOKEN']) {
    return process.env.FLY_API_TOKEN;
  }
  throw new Error('FLY_API_TOKEN missing');
}

function getFlyHeaders() {
  return { Authorization: `Bearer ${getFlyToken()}` };
}

async function getOrgId(org: string) {
  const query = gql`
    query {
      organizations {
        nodes {
          id
          name
        }
      }
    }
  `;

  try {
    const response = await request<OrgPayload>(
      FLY_URL,
      query,
      undefined,
      getFlyHeaders()
    );

    const orgId = response.organizations.nodes.find(
      (node) => node.name === org
    )?.id;
    if (!orgId) {
      logger.error(`organization id not found for slug: ${org}`);
      throw new Error();
    }
    return orgId;
  } catch (error) {
    logger.debug(error);
    return;
  }
}

async function getApp(name: string) {
  const query = gql`
    query ($name: String) {
      app(name: $name) {
        status
        regions {
          code
        }
        organization {
          id
        }
      }
    }
  `;

  try {
    const response = await request<AppPayload>(
      FLY_URL,
      query,
      { name },
      getFlyHeaders()
    );

    logger.debug('getApp response', JSON.stringify(response, undefined, 2));
    return response;
  } catch (error) {
    logger.debug(error);
    return;
  }
}

async function createApp({
  appName,
  region,
  organization,
}: {
  appName: string;
  region: string;
  organization: string;
}) {
  const query = gql`
    mutation ($input: CreateAppInput!) {
      createApp(input: $input) {
        app {
          state
        }
      }
    }
  `;

  const input = {
    name: appName,
    preferredRegion: region,
    organizationId: await getOrgId(organization),
  };

  try {
    const response = await request<CreateAppPayload>(
      FLY_URL,
      query,
      { input },
      getFlyHeaders()
    );

    logger.debug('createApp response', JSON.stringify(response, undefined, 2));

    if (!response.createApp) {
      return false;
    }

    return true;
  } catch (error) {
    if (error instanceof ClientError) {
      logger.log(error.message);
    }
    throw new Error('unable to create app');
  }
}

async function verifyApp({
  name,
  organization,
  region,
}: {
  name: string;
  organization: string;
  region: string;
}) {
  const app = await getApp(name);
  if (!app) {
    const created = await createApp({
      appName: name,
      organization,
      region,
    });
    if (!created) {
      throw new Error('app failed to create or name not available');
    }
  }
}

export async function deploySecrets(args: {
  appName: string;
  envFile: string;
  replaceAll: boolean;
  organization: string;
  primaryRegion: string;
  restart: boolean;
  verbose?: boolean;
}) {
  await verifyApp({
    name: args.appName,
    organization: args.organization,
    region: args.primaryRegion,
  });
  const secrets = getSecretsFromEnv(args.envFile);
  const query = gql`
    mutation ($input: SetSecretsInput!) {
      setSecrets(input: $input) {
        release {
          id
          version
          reason
          description
          user {
            id
            email
            name
          }
          evaluationId
          createdAt
        }
      }
    }
  `;
  const input = {
    appId: args.appName,
    secrets: Object.keys(secrets).map((key) => ({
      key,
      value: secrets[key],
    })),
    replaceAll: args.replaceAll, // if true, it will remove any secrets not included here
  };

  try {
    const response = await request(FLY_URL, query, { input }, getFlyHeaders());

    args.verbose ??
      logger.debug(
        'setSecrets response',
        JSON.stringify(response, undefined, 2)
      );
  } catch (error) {
    logger.error(error);
    if (error instanceof ClientError) {
      logger.log(error.message);
    }
    throw new Error('unable to deploy secrets');
  }

  if (args.restart) {
    try {
      await restart(args.appName);
    } catch (error) {
      logger.error('error restarting app');
    }
  }
}

async function restart(appName: string) {
  const query = gql`
    mutation ($input: RestartAppInput!) {
      restartApp(input: $input) {
        app {
          name
          id
        }
      }
    }
  `;

  const input = {
    appId: appName,
  };

  try {
    await request(FLY_URL, query, { input }, getFlyHeaders());
  } catch (error) {
    logger.error(error);
    if (error instanceof ClientError) {
      logger.log(error.message);
    }
    throw new Error('unable to restart');
  }
}

export async function deploy(
  {
    appName,
    tomlFile,
    dockerfile,
    regions,
    organization,
    verbose,
  }: {
    appName: string;
    tomlFile: string;
    dockerfile: string;
    regions: string[];
    organization: string;
    verbose?: boolean;
  },
  context: ExecutorContext
) {
  const cwd = join(
    context.root,
    context.workspace?.projects[context.projectName || '']?.sourceRoot || ''
  );
  verbose ?? logger.debug({ spawnCwd: cwd });
  await verifyApp({ name: appName, organization, region: regions[0] });
  const deployments = regions.map(
    (region) =>
      new Promise((res, rej) => {
        const spawned = spawn(
          `flyctl deploy`,
          [
            `--app=${appName}`,
            `--auto-confirm`,
            `--config=${tomlFile}`,
            `--dockerfile=${dockerfile}`,
            `--region=${region}`,
            `--local-only`,
          ],
          {
            cwd,
            shell: process.env.SHELL || 'zsh',
            stdio: 'inherit',
          }
        );

        spawned.on('error', (err) => {
          logger.error(err);
          rej(region);
        });

        spawned.on('close', (code) => {
          if (code !== 0) {
            verbose ?? logger.debug({ appName, region });
            logger.error('fly deploy exited with non-zero code: ' + code);
            rej(region);
          }

          res(region);
        });
      })
  );

  const results = await Promise.allSettled(deployments);
  const failed = [];
  results.forEach((result) => {
    verbose ?? logger.debug(result);
    if (result.status === 'rejected') {
      logger.error('failed to deploy to ' + result.reason);
      failed.push(result.reason);
    } else {
      logger.info('deployed to ' + result.value);
    }
  });

  if (failed.length) {
    throw new Error('failed to deploy to all regions');
  }
}

export async function runCli(
  {
    appName,
    organization,
    arg1,
    arg2,
    verbose,
    _,
    ...additional
  }: CliExecutorSchema,
  context: ExecutorContext
) {
  const cwd = join(
    context.root,
    context.workspace?.projects[context.projectName || '']?.sourceRoot || ''
  );
  if (verbose) {
    logger.debug({ spawnCwd: cwd });
  }
  const passedOpts = Object.keys(additional).map(
    (key) => `--${key}=${additional[key as never]}`
  );
  await new Promise((res, rej) => {
    const spawned = spawn(
      `flyctl ${arg1}`,
      [
        arg2 || '',
        ...(_ || []),
        `--app=${appName}`,
        `--org=${organization}`,
        ...(passedOpts || []),
      ],
      {
        cwd,
        shell: process.env.SHELL || 'zsh',
        stdio: 'pipe',
      }
    );

    spawned.on('error', (err) => {
      logger.error(err);
      rej();
    });

    spawned.on('close', (code) => {
      if (code !== 0) {
        logger.error('fly deploy exited with non-zero code: ' + code);
        rej();
      }

      res('success: ' + code);
    });

    spawned.stdin.pipe(process.stdin);
    spawned.stderr.pipe(process.stderr);
    spawned.stdout.pipe(process.stdout);
  });
}
