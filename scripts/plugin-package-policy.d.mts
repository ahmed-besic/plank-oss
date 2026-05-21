export function validatePluginPackagePolicy(packageDir: string): {
  diagnostics: string[];
};

export function assertPluginPackagePolicy(packageDir: string): {
  diagnostics: string[];
};

export function getPluginExportPath(
  packageDir: string,
  packageJson: Record<string, unknown>,
  exportName: string,
): string | undefined;

export function pluginIdFromPackageName(packageName: string): string | undefined;
