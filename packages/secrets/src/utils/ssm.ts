import {
  GetParametersCommand,
  ParameterType,
  PutParameterCommand,
  SSMClient,
  SSMClientConfig,
} from '@aws-sdk/client-ssm';
import { fromSSO } from '@aws-sdk/credential-providers';
import { logger } from '@nx/devkit';
import { parse } from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { GetExecutorSchema } from '../executors/get/schema';
import { SetExecutorSchema } from '../executors/set/schema';

type OutputVars = { name: string; value: string };

function getAwsConfig(
  awsRegion: string,
  awsProfileName?: string
): SSMClientConfig {
  return {
    credentials: fromSSO({
      profile: awsProfileName,
    }),
    region: awsRegion,
    retryMode: 'adaptive',
  };
}

function getSecretsFromEnv(filePath: string): Record<string, string> {
  try {
    return parse(readFileSync(filePath));
  } catch (error) {
    logger.debug(error);
    throw new Error(`unable to read secrets from env file at: ${filePath}`);
  }
}

function getEnvVarsFromJsonFile(jsonFilePath: string): Record<string, string> {
  try {
    const file = readFileSync(jsonFilePath);
    return JSON.parse(file.toString('utf-8'));
  } catch (error) {
    logger.debug(error);
    throw new Error(`unable to read json file at: ${jsonFilePath}`);
  }
}

function writeToEnvFile(values: OutputVars[], targetFileName: string) {
  try {
    const data = values.reduce(
      (prev, curr) => `${prev}${curr.name}=${curr.value}\r\n`,
      ''
    );
    writeFileSync(targetFileName, data);
  } catch (error) {
    logger.debug(error);
    throw new Error(
      `unable to write variables to env file at: ${targetFileName}`
    );
  }
}

export async function getSecrets({
  ssmPrefix,
  envFile,
  secretsJson,
  awsProfileName,
  awsRegion,
}: GetExecutorSchema) {
  const client = new SSMClient(getAwsConfig(awsRegion, awsProfileName));
  const paramRecords = getEnvVarsFromJsonFile(secretsJson);
  const parameters = Object.keys(paramRecords).map((key) => ({
    ssm: paramRecords[key],
    variable: key,
  }));

  // limited to 10 per call
  // https://docs.aws.amazon.com/systems-manager/latest/APIReference/API_GetParameters.html
  const names: string[][] = [];
  const nameMap: Record<string, string> = {};
  for (let i = 0; i < parameters.length; i += 10) {
    names.push(
      parameters.slice(i, i + 10).map(({ ssm, variable }) => {
        nameMap[`${ssmPrefix}${ssm}`] = variable;
        return `${ssmPrefix}${ssm}`;
      })
    );
  }

  if (!names.length || !names[0].length) {
    logger.info(
      'No variables to fetch, add references to your secretsJson file'
    );
    return;
  }

  logger.debug(
    `fetching ${parameters.length} parameters in ${names.length} batches`
  );
  const outputVars: OutputVars[] = [];

  for (const splitNames of names) {
    try {
      logger.debug('fetching parameters', { parameters: splitNames });
      const { Parameters } = await client.send(
        new GetParametersCommand({ Names: splitNames })
      );
      logger.debug('returned parameters', { parameters: Parameters });
      if (!Parameters) {
        throw new Error('Parameters not found');
      }
      outputVars.push(
        ...Parameters.map((param) => ({
          name: nameMap[param.Name || ''],
          value: param.Value || '',
        }))
      );
    } catch (error) {
      logger.debug(error);
      throw new Error('error with SSM api');
    }
  }

  if (!outputVars.length) {
    logger.info('No variables found, skipping');
    return;
  }

  writeToEnvFile(outputVars, envFile);
}

export async function putSecrets({
  ssmPrefix,
  envFile,
  secretsJson,
  awsProfileName,
  awsRegion,
}: SetExecutorSchema) {
  const paramsToPut = getEnvVarsFromJsonFile(secretsJson);
  const secrets = getSecretsFromEnv(envFile);
  const client = new SSMClient(getAwsConfig(awsRegion, awsProfileName));

  for (const key of Object.keys(paramsToPut)) {
    const paramName = `${ssmPrefix}${paramsToPut[key]}`;
    const value = secrets[key];
    try {
      await client.send(
        new PutParameterCommand({
          Name: paramName,
          Value: value,
          Overwrite: true,
          Type: ParameterType.STRING,
        })
      );
      logger.debug('Uploaded param', { Name: paramName, Value: value });
    } catch (error) {
      logger.debug(error);
      throw new Error(`unable to upload parameter: ${paramName}`);
    }
  }
}
