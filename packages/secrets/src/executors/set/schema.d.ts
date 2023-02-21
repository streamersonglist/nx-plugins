export type SetExecutorSchema = {
  envFile: string;
  secretsJson: string;
  awsRegion: string;
  ssmPrefix?: string;
  awsProfileName?: string;
}
