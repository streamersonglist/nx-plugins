import {
  GetParametersCommand,
  ParameterType,
  PutParameterCommand,
  SSMClientConfig,
  SSMClient,
} from '@aws-sdk/client-ssm';
import { fromSSO } from '@aws-sdk/credential-providers';
import { parse } from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { logger } from '@nrwl/devkit';
import { GetExecutorSchema } from '../executors/get/schema';
import { SetExecutorSchema } from '../executors/set/schema';

type OutputVars = { name: string; value: string };

function getAwsConfig(awsProfileName?: string): SSMClientConfig {
  return {
    credentials: fromSSO({
      profile: awsProfileName,
    }),
    region: 'us-west-2',
    retryMode: 'adaptive'
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
}: GetExecutorSchema) {
  const client = new SSMClient(getAwsConfig(awsProfileName));
  const paramRecords = getEnvVarsFromJsonFile(secretsJson);
  let parameters = Object.keys(paramRecords).map((key) => ({
    ssm: paramRecords[key],
    variable: key,
  }));

  // limited to 10 per call
  // https://docs.aws.amazon.com/systems-manager/latest/APIReference/API_GetParameters.html
  let names: string[][];
  let nameMap: Record<string, string> = {};
  for (let i = 0; i < Math.ceil(parameters.length / 10); i += 10) {
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

  for (let splitNames of names) {
    try {
      const { Parameters } = await client.send(
        new GetParametersCommand({ Names: splitNames })
      );
      outputVars.push(
        ...Parameters.map((param) => ({
          name: nameMap[param.Name],
          value: param.Value || '',
        }))
      );
    } catch (error) {
      logger.debug(error);
      throw new Error('error with SSM api');
    }
  }

  if (!outputVars.length) {
    logger.info('no variables found, skipping');
    return;
  }

  writeToEnvFile(outputVars, envFile);
}

export async function putSecrets({
  ssmPrefix,
  envFile,
  secretsJson,
  awsProfileName,
}: SetExecutorSchema) {
  const paramsToPut = getEnvVarsFromJsonFile(secretsJson);
  const secrets = getSecretsFromEnv(envFile);
  const client = new SSMClient(getAwsConfig(awsProfileName));

  for (let key of Object.keys(paramsToPut)) {
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
