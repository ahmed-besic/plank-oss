import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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
});
