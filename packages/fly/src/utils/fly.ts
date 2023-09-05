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
    organization: { id: string };
  } | null;
};
type IpAddresses = {
  app: {
    ipAddresses: {
      nodes: {
        id: string;
        address: string;
        type: string;
        region: string;
        createdAt: string;
      }[];
    };
    sharedIpAddress: string | null;
  };
};
type IpAddressType = 'v4' | 'v6' | 'private_v6' | 'shared_v4';
type AllocateIpAddressPayload = {
  allocateIpAddress: {
    ipAddress: {
      id: string;
      address: string;
      type: IpAddressType;
      region: string;
      createdAt: string;
    };
  };
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

export async function getApp(name: string) {
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

export async function setupIps(args: {
  appName: string;
  organizationId: string;
  region: string;
  types: IpAddressType[];
}) {
  logger.info('Setting up IP Addresses');
  const ips = await getIps(args.appName);

  for (const type of ['v4', 'v6', 'private_v6'] as const) {
    const ip = ips?.app.ipAddresses.nodes.find((ip) => ip.type === type);
    if (ip && args.types.includes(type)) {
      logger.info(`IP Address ${ip.address} already exists`);
      continue;
    }

    if (ip && !args.types.includes(type)) {
      logger.info(`Releasing IP Address ${ip.address}`);
      await releaseIpAddress({
        appName: args.appName,
        ipAddress: ip.address,
      });
      continue;
    }

    if (!ip && args.types.includes(type)) {
      const newIp = await allocateIpAddress({
        appName: args.appName,
        organization: args.organizationId,
        region: args.region,
        type,
      });
      logger.info(`IP Address ${newIp.address} created`);
      continue;
    }
  }

  if (ips?.app.sharedIpAddress && !args.types.includes('shared_v4')) {
    logger.info(`Releasing shared IP Address ${ips.app.sharedIpAddress}`);
    await releaseIpAddress({
      appName: args.appName,
      ipAddress: ips.app.sharedIpAddress,
    });
  }

  if (!ips?.app.sharedIpAddress && args.types.includes('shared_v4')) {
    const newIp = await allocateIpAddress({
      appName: args.appName,
      organization: args.organizationId,
      region: args.region,
      type: 'shared_v4',
    });
    logger.info(`Shared IP Address ${newIp.address} created`);
  }

  logger.info('IP Addresses setup complete');
}

export async function getIps(name: string) {
  const query = gql`
    query ($appName: String!) {
      app(name: $appName) {
        ipAddresses {
          nodes {
            id
            address
            type
            region
            createdAt
          }
        }
        sharedIpAddress
      }
    }
  `;

  try {
    const response = await request<IpAddresses>(
      FLY_URL,
      query,
      { name },
      getFlyHeaders()
    );

    logger.debug('getIps response', JSON.stringify(response, undefined, 2));
    return response;
  } catch (error) {
    logger.debug(error);
    return;
  }
}

export async function releaseIpAddress({
  appName,
  ipAddress,
}: {
  appName: string;
  ipAddress: string;
}) {
  const query = gql`
    mutation ($input: ReleaseIPAddressInput!) {
      releaseIpAddress(input: $input) {
        clientMutationId
      }
    }
  `;

  const input = {
    appId: appName,
    ip: ipAddress,
  };

  try {
    const response = await request<unknown>(
      FLY_URL,
      query,
      { input },
      getFlyHeaders()
    );

    logger.debug(
      'releaseIpAddress response',
      JSON.stringify(response, undefined, 2)
    );

    return true;
  } catch (error) {
    if (error instanceof ClientError) {
      logger.log(error.message);
    }
    throw new Error('unable to create app');
  }
}

export async function allocateIpAddress({
  appName,
  region,
  organization,
  type,
}: {
  appName: string;
  region: string;
  organization: string;
  type: IpAddressType;
}) {
  const query = gql`
    mutation ($input: AllocateIPAddressInput!) {
      allocateIpAddress(input: $input) {
        ipAddress {
          id
          address
          type
          region
          createdAt
        }
      }
    }
  `;

  const input = {
    type,
    region,
    appId: appName,
    organizationId: await getOrgId(organization),
  };

  try {
    const response = await request<AllocateIpAddressPayload>(
      FLY_URL,
      query,
      { input },
      getFlyHeaders()
    );

    logger.debug(
      'allocateIpAddress response',
      JSON.stringify(response, undefined, 2)
    );

    if (!response.allocateIpAddress.ipAddress) {
      throw new Error('unable to allocate ip address');
    }

    return response.allocateIpAddress.ipAddress;
  } catch (error) {
    if (error instanceof ClientError) {
      logger.log(error.message);
    }
    throw new Error('unable to create app');
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
    ipAddressTypes,
  }: {
    appName: string;
    tomlFile: string;
    dockerfile: string;
    regions: string[];
    organization: string;
    verbose?: boolean;
    ipAddressTypes: IpAddressType[];
  },
  context: ExecutorContext
) {
  const cwd = join(
    context.root,
    context.workspace?.projects[context.projectName || '']?.root || ''
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

  const app = await getApp(appName);
  if (app?.app) {
    for (const region of app.app.regions) {
      await setupIps({
        appName,
        region: region.code,
        organizationId: app.app.organization.id,
        types: ipAddressTypes,
      });
    }
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
    context.workspace?.projects[context.projectName || '']?.root || ''
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
