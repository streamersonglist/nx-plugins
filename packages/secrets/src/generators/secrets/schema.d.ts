export interface SecretsGeneratorSchema {
  project: string;
  awsRegion: string;
  envFile?: string;
  secretsJsonFilename?: string;
  ssmPrefix?: string;
  awsProfileName?: string;
}
