export type FlyGeneratorSchema = {
  project: string;
  appName: string;
  envFile?: string;
  tomlFile?: string;
  organization: string;
  primaryRegion: string;
};
