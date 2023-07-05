export type DeploySecretsExecutorSchema = {
  appName: string;
  envFile: string;
  replaceAll: boolean;
  organization: string;
  primaryRegion: string;
  restart: boolean;
  verbose?: boolean;
};
