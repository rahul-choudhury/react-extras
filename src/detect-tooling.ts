import { existsSync } from "node:fs";
import { join } from "node:path";
import { getAllDependencies, tryReadPackageJson } from "./package-json.js";

export type Tooling = "biome" | "eslint-prettier";

export interface ToolingDetectionResult {
    tooling: Tooling;
    inferred: boolean;
}

export interface LintStagedConfig {
    [pattern: string]: string | string[];
}

export function detectTooling(cwd: string): ToolingDetectionResult {
    if (
        existsSync(join(cwd, "biome.json")) ||
        existsSync(join(cwd, "biome.jsonc"))
    ) {
        return { tooling: "biome", inferred: false };
    }

    const pkg = tryReadPackageJson(cwd);
    if (pkg) {
        const allDeps = getAllDependencies(pkg);

        if (allDeps["@biomejs/biome"]) {
            return { tooling: "biome", inferred: false };
        }

        // Check for ESLint or Prettier specifically
        if (allDeps.eslint || allDeps.prettier) {
            return { tooling: "eslint-prettier", inferred: false };
        }
    }

    return { tooling: "eslint-prettier", inferred: true };
}

export function getLintStagedConfig(tooling: Tooling): LintStagedConfig {
    if (tooling === "biome") {
        return {
            "*": "biome check --write --no-errors-on-unmatched",
        };
    }

    return {
        "*.{js,jsx,ts,tsx,css,md}": "prettier --write",
        "*.{js,jsx,ts,tsx}": "eslint",
    };
}

export function getToolingLabel(tooling: Tooling): string {
    return tooling === "biome" ? "Biome" : "ESLint + Prettier";
}
