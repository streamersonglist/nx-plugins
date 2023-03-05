export interface DeployExecutorSchema {
  appName: string;
  organization: string;
  dockerfile: string;
  tomlFile: string;
  regions: string[];
  verbose?: boolean;
}
