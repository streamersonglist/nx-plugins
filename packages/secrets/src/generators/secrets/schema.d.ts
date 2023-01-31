export interface SecretsGeneratorSchema {
  project: string;
  envFile?: string;
  secretsJsonFilename?: string;
  ssmPrefix?: string;
  awsProfileName?: string;
}
