export type GetExecutorSchema = {
  envFile: string;
  secretsJson: string;
  ssmPrefix?: string;
  awsProfileName?: string;
};
