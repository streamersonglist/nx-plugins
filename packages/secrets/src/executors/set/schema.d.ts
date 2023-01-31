export type SetExecutorSchema = {
  envFile: string;
  secretsJson: string;
  ssmPrefix?: string;
  awsProfileName?: string;
}
