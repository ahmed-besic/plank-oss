import fs from "node:fs";
import path from "node:path";

export const REQUIRED_PLUGIN_EXPORTS = [".", "./server", "./manifest"];
export const SEMVER_LIKE_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
export const VALID_PLUGIN_HOOKS = new Set([
  "registerView",
  "registerPropertyType",
  "registerCommand",
  "registerUiExtension",
  "registerCardChange",
  "registerBoardTypeTemplate",
  "registerCardTypeManifest",
]);
export const VALID_PLUGIN_PERMISSIONS = new Set([
  "cards:read",
  "cards:write",
  "boardViews:read",
]);
export const VALID_PLUGIN_TRUST_LEVELS = new Set([
  "builtin",
  "trusted-local",
  "restricted",
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readTextIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function getPackageExport(packageJson, exportName) {
  if (exportName === "." && typeof packageJson.exports === "string") {
    return packageJson.exports;
  }
  if (!packageJson.exports || typeof packageJson.exports !== "object") {
    return undefined;
  }
  return packageJson.exports[exportName];
}

export function getPluginExportPath(packageDir, packageJson, exportName) {
  const exportValue = getPackageExport(packageJson, exportName);
  if (typeof exportValue !== "string") {
    return undefined;
  }
  return path.join(packageDir, exportValue.replace(/^\.\//, ""));
}

export function pluginIdFromPackageName(packageName) {
  const prefix = "@plank/plugin-";
  if (typeof packageName !== "string" || !packageName.startsWith(prefix)) {
    return undefined;
  }
  return packageName.slice(prefix.length);
}

function parseStringProperty(source, key) {
  return source.match(new RegExp(`${key}\\s*:\\s*["']([^"']+)["']`))?.[1];
}

function parseStringConst(source, constName) {
  return source.match(new RegExp(`const\\s+${constName}\\s*=\\s*["']([^"']+)["']`))?.[1];
}

function parseStringOrConstProperty(fullSource, blockSource, key) {
  const literal = parseStringProperty(blockSource, key);
  if (literal) {
    return literal;
  }
  const identifier = blockSource.match(new RegExp(`${key}\\s*:\\s*(\\w+)`))?.[1];
  return identifier ? parseStringConst(fullSource, identifier) : undefined;
}

function parseStringArrayProperty(source, key) {
  const match = source.match(new RegExp(`${key}\\s*:\\s*\\[([\\s\\S]*?)\\]`));
  if (!match) {
    return undefined;
  }
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map((entry) => entry[1]);
}

export function parseManifestSource(source) {
  const manifestBlock =
    [...source.matchAll(/export const (\w*(?:Manifest|PluginManifest))[^=]*=\s*\{([\s\S]*?)\n\};/g)]
      .find((match) => match[2].includes("capabilities"))?.[2] ?? source;
  return {
    id: parseStringOrConstProperty(source, manifestBlock, "id"),
    name: parseStringOrConstProperty(source, manifestBlock, "name"),
    version: parseStringProperty(manifestBlock, "version"),
    hooks: parseStringArrayProperty(manifestBlock, "hooks") ?? [],
    capabilities: parseStringArrayProperty(manifestBlock, "capabilities") ?? [],
    trustLevel: parseStringProperty(manifestBlock, "trustLevel"),
    serverModule: parseStringProperty(manifestBlock, "serverModule"),
  };
}

function hasImportFrom(source, importPath, importedName) {
  const importPattern = new RegExp(
    `import\\s*\\{[\\s\\S]*?\\b${importedName}\\b[\\s\\S]*?\\}\\s*from\\s*["']${importPath}["']`,
  );
  return importPattern.test(source);
}

export function validatePluginPackagePolicy(packageDir) {
  const diagnostics = [];
  const packageJsonPath = path.join(packageDir, "package.json");
  const packageJson = readJson(packageJsonPath);
  const packageName = String(packageJson.name ?? "");
  const packagePluginId = pluginIdFromPackageName(packageName);

  if (!packagePluginId) {
    diagnostics.push(`${packageName || packageDir} must be named @plank/plugin-<id>`);
  }

  if (!SEMVER_LIKE_PATTERN.test(String(packageJson.version ?? ""))) {
    diagnostics.push(`${packageName} package version must be semver-like`);
  }

  const exportPaths = new Map();
  for (const exportName of REQUIRED_PLUGIN_EXPORTS) {
    const exportPath = getPluginExportPath(packageDir, packageJson, exportName);
    if (!exportPath) {
      diagnostics.push(`${packageName} must expose ${exportName}`);
      continue;
    }
    exportPaths.set(exportName, exportPath);
    if (!fs.existsSync(exportPath)) {
      diagnostics.push(`${packageName} export ${exportName} points to missing file ${exportPath}`);
    }
  }

  const manifestPath = exportPaths.get("./manifest");
  const manifestSource = readTextIfExists(manifestPath);
  const manifest = parseManifestSource(manifestSource);

  if (!manifest.id) {
    diagnostics.push(`${packageName} manifest must declare id`);
  } else if (packagePluginId && manifest.id !== packagePluginId) {
    diagnostics.push(`${packageName} manifest id ${manifest.id} must match package id ${packagePluginId}`);
  }

  if (!manifest.version || !SEMVER_LIKE_PATTERN.test(manifest.version)) {
    diagnostics.push(`${packageName} manifest version must be semver-like`);
  } else if (manifest.version !== packageJson.version && packageJson.version !== "0.0.0") {
    diagnostics.push(`${packageName} manifest version ${manifest.version} must match package version ${packageJson.version}`);
  }

  if (!manifest.trustLevel || !VALID_PLUGIN_TRUST_LEVELS.has(manifest.trustLevel)) {
    diagnostics.push(`${packageName} manifest trustLevel must be builtin, trusted-local, or restricted`);
  }

  if (manifest.serverModule !== "./server") {
    diagnostics.push(`${packageName} manifest serverModule must be "./server"`);
  }

  for (const hook of manifest.hooks) {
    if (!VALID_PLUGIN_HOOKS.has(hook)) {
      diagnostics.push(`${packageName} manifest declares invalid hook ${hook}`);
    }
  }

  for (const permission of manifest.capabilities) {
    if (!VALID_PLUGIN_PERMISSIONS.has(permission)) {
      diagnostics.push(`${packageName} manifest declares invalid permission ${permission}`);
    }
  }

  const clientSource = readTextIfExists(exportPaths.get("."));
  const serverSource = readTextIfExists(exportPaths.get("./server"));
  const manifestExportName = [...manifestSource.matchAll(/export const (\w+Manifest|\w+PluginManifest)\b/g)][0]?.[1];

  if (manifestExportName) {
    if (!hasImportFrom(clientSource, "./manifest", manifestExportName)) {
      diagnostics.push(`${packageName} client entry must import ${manifestExportName} from ./manifest`);
    }
    if (!hasImportFrom(serverSource, "./manifest", manifestExportName)) {
      diagnostics.push(`${packageName} server entry must import ${manifestExportName} from ./manifest`);
    }
  } else {
    diagnostics.push(`${packageName} manifest module must export a manifest constant`);
  }

  return {
    diagnostics,
    manifest,
    packageJson,
    packageName,
    packagePluginId,
    exportPaths,
  };
}

export function assertPluginPackagePolicy(packageDir) {
  const result = validatePluginPackagePolicy(packageDir);
  if (result.diagnostics.length > 0) {
    throw new Error(result.diagnostics.join("\n"));
  }
  return result;
}
