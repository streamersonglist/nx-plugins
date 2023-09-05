export interface DeployExecutorSchema {
  appName: string;
  organization: string;
  dockerfile: string;
  ipAddressTypes: ('v4' | 'v6' | 'private_v6' | 'shared_v4')[];
  tomlFile: string;
  regions: string[];
  verbose?: boolean;
}
