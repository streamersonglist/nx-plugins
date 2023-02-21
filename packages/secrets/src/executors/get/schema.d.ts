export type GetExecutorSchema = {
  envFile: string;
  secretsJson: string;
  awsRegion: string;
  ssmPrefix?: string;
  awsProfileName?: string;
};
