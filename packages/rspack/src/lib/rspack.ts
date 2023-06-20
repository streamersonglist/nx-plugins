import { ExecutorContext } from '@nx/devkit';
import { Configuration } from '@rspack/core';
import { GeneratePackageJsonPlugin } from '@nx/webpack/src/plugins/generate-package-json-plugin';

export function withGeneratePackageJson(_opts = {}) {
  return function makeConfig(
    config: Configuration,
    {
      options,
      context,
    }: {
      options: {
        generatePackageJson?: boolean;
        tsConfig: string;
        outputFileName: string;
      };
      context: ExecutorContext;
    }
  ): Configuration {
    const plugins = config.plugins ?? [];
    if (options.generatePackageJson && context) {
      plugins.push(new GeneratePackageJsonPlugin(options, context) as never);
    }

    const updated: Configuration = {
      ...config,
      plugins: plugins,
    };

    return updated;
  };
}
