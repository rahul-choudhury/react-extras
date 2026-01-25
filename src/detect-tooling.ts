import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

    const pkgPath = join(cwd, "package.json");
    if (existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
            const allDeps = {
                ...pkg.dependencies,
                ...pkg.devDependencies,
            };

            if (allDeps["@biomejs/biome"]) {
                return { tooling: "biome", inferred: false };
            }

            // Check for ESLint or Prettier specifically
            if (allDeps.eslint || allDeps.prettier) {
                return { tooling: "eslint-prettier", inferred: false };
            }
        } catch {}
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
