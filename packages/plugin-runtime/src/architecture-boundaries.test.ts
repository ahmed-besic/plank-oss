import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pluginRuntimePermissions, pluginTrustLevels } from "@plank/domain";
import { describe, expect, it } from "vitest";
import { validatePluginPackagePolicy } from "../../../scripts/plugin-package-policy.mjs";
import { builtinClientPlugins } from "./client";
import { validatePluginManifest } from "./index";
import { builtinServerPlugins } from "./server";
import { requiredBuiltinPluginIds } from "./constants";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const packagesRoot = path.join(repoRoot, "packages");
const pluginPackagesRoot = path.join(packagesRoot, "plugins");
const appsWebRoot = path.join(repoRoot, "apps", "web");
const convexRoot = path.join(repoRoot, "convex");
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"]);
const allowedPluginWorkspaceDependencies = new Set([
  "@plank/board-views",
  "@plank/domain",
  "@plank/plugin-sdk",
  "@plank/ui",
]);

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
}

function listDirectories(root: string) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name));
}

function listSourceFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }

  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
      continue;
    }

    if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function getImportSources(sourceText: string) {
  const sources: string[] = [];
  const pattern =
    /(?:import|export)\s[\s\S]*?\sfrom\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of sourceText.matchAll(pattern)) {
    const source = match[1] ?? match[2];
    if (source) {
      sources.push(source);
    }
  }

  return sources;
}

function isForbiddenResolvedPath(resolvedPath: string) {
  return (
    resolvedPath === appsWebRoot ||
    resolvedPath.startsWith(`${appsWebRoot}${path.sep}`) ||
    resolvedPath === convexRoot ||
    resolvedPath.startsWith(`${convexRoot}${path.sep}`)
  );
}

describe("plugin architecture boundaries", () => {
  it("keeps runtime package exports explicit", () => {
    const packageJson = readJson(path.join(packagesRoot, "plugin-runtime", "package.json"));

    expect(packageJson.exports).toEqual({
      ".": "./src/index.ts",
      "./client": "./src/client.ts",
      "./server": "./src/server.ts",
    });
  });

  it("validates generated builtin manifest trust and permission metadata", () => {
    const requiredIds = new Set(requiredBuiltinPluginIds);
    const diagnostics: string[] = [];
    const clientOrder = builtinClientPlugins.map((plugin) => plugin.manifest.id);
    const serverOrder = builtinServerPlugins.map((plugin) => plugin.manifest.id);

    expect(clientOrder).toEqual([...clientOrder].sort());
    expect(serverOrder).toEqual([...serverOrder].sort());
    expect(serverOrder).toEqual(clientOrder);

    for (const plugin of [...builtinClientPlugins, ...builtinServerPlugins]) {
      diagnostics.push(
        ...validatePluginManifest(plugin.manifest).map((entry) => entry.message),
      );

      if (!pluginTrustLevels.includes((plugin.manifest.trustLevel ?? "trusted-local") as any)) {
        diagnostics.push(`${plugin.manifest.id} has invalid trustLevel`);
      }

      for (const permission of plugin.manifest.capabilities) {
        if (!pluginRuntimePermissions.includes(permission as any)) {
          diagnostics.push(`${plugin.manifest.id} declares invalid permission ${permission}`);
        }
      }

      if (requiredIds.has(plugin.manifest.id)) {
        expect(plugin.manifest.trustLevel).toBe("builtin");
      }
    }

    expect(diagnostics).toEqual([]);
  });

  it("validates local plugin package export and manifest policy", () => {
    const diagnostics: string[] = [];

    for (const packageDir of listDirectories(pluginPackagesRoot)) {
      const result = validatePluginPackagePolicy(packageDir);
      diagnostics.push(
        ...result.diagnostics.map(
          (diagnostic) => `${path.basename(packageDir)}: ${diagnostic}`,
        ),
      );
    }

    expect(diagnostics).toEqual([]);
  });

  it("restricts plugin packages to approved shared workspace dependencies", () => {
    const violations: string[] = [];

    for (const packageDir of listDirectories(pluginPackagesRoot)) {
      const packageJsonPath = path.join(packageDir, "package.json");
      const packageJson = readJson(packageJsonPath);
      const packageName = String(packageJson.name ?? path.basename(packageDir));
      const dependencySections = [
        packageJson.dependencies,
        packageJson.devDependencies,
        packageJson.peerDependencies,
        packageJson.optionalDependencies,
      ];

      for (const section of dependencySections) {
        if (!section || typeof section !== "object") {
          continue;
        }

        for (const [dependencyName, version] of Object.entries(section)) {
          if (
            typeof version === "string" &&
            version.startsWith("workspace:") &&
            dependencyName.startsWith("@plank/") &&
            !allowedPluginWorkspaceDependencies.has(dependencyName)
          ) {
            violations.push(
              `${packageName} depends on disallowed workspace package ${dependencyName}`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps package source code from reaching into apps/web or convex directly", () => {
    const violations: string[] = [];

    for (const packageDir of listDirectories(packagesRoot)) {
      const sourceDir = path.join(packageDir, "src");

      for (const filePath of listSourceFiles(sourceDir)) {
        const fileText = fs.readFileSync(filePath, "utf8");
        const importSources = getImportSources(fileText);

        for (const source of importSources) {
          if (source.startsWith(".")) {
            const resolvedPath = path.resolve(path.dirname(filePath), source);
            if (isForbiddenResolvedPath(resolvedPath)) {
              violations.push(
                `${path.relative(repoRoot, filePath)} imports ${source}`,
              );
            }
            continue;
          }

          if (
            source === "apps/web" ||
            source.startsWith("apps/web/") ||
            source === "convex" ||
            source.startsWith("convex/")
          ) {
            violations.push(`${path.relative(repoRoot, filePath)} imports ${source}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps generated server builtins from importing client plugin entrypoints", () => {
    const generatedServerBuiltinsPath = path.join(
      packagesRoot,
      "plugin-runtime",
      "src",
      "builtins.server.generated.ts",
    );
    const sourceText = fs.readFileSync(generatedServerBuiltinsPath, "utf8");
    const importSources = getImportSources(sourceText);

    expect(importSources.every((source) => !source.endsWith(".tsx"))).toBe(true);
    expect(importSources.every((source) => source.endsWith("/server.ts"))).toBe(
      true,
    );
  });
});
