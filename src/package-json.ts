import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Framework } from "./detect-framework.js";
import type { LintStagedConfig, Tooling } from "./detect-tooling.js";

export interface PackageJson {
    scripts?: Record<string, string>;
    "lint-staged"?: LintStagedConfig;
    [key: string]: unknown;
}

export interface UpdatePackageJsonOptions {
    cwd: string;
    lintStagedConfig: LintStagedConfig;
    framework: Framework;
    tooling: Tooling;
}

export interface UpdatePackageJsonResult {
    addedPrepare: boolean;
    addedLintStaged: boolean;
    addedCheck: boolean;
}

export function readPackageJson(cwd: string): PackageJson {
    const pkgPath = join(cwd, "package.json");
    return JSON.parse(readFileSync(pkgPath, "utf-8"));
}

export function writePackageJson(cwd: string, pkg: PackageJson): void {
    const pkgPath = join(cwd, "package.json");
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function getCheckScript(tooling: Tooling): string {
    return tooling === "biome"
        ? "biome check ."
        : "eslint . && prettier --check .";
}

export function updatePackageJson(
    options: UpdatePackageJsonOptions,
): UpdatePackageJsonResult {
    const { cwd, lintStagedConfig, framework, tooling } = options;
    const pkg = readPackageJson(cwd);

    const addedPrepare = !pkg.scripts?.prepare;
    const addedLintStaged = !pkg["lint-staged"];
    const addedCheck = framework === "nextjs" && !pkg.scripts?.check;

    if (!pkg.scripts) {
        pkg.scripts = {};
    }
    if (!pkg.scripts.prepare) {
        pkg.scripts.prepare = "husky";
    }
    if (!pkg.scripts.typecheck) {
        pkg.scripts.typecheck = "tsc --noEmit";
    }
    if (framework === "nextjs" && !pkg.scripts.check) {
        pkg.scripts.check = getCheckScript(tooling);
    }

    if (!pkg["lint-staged"]) {
        pkg["lint-staged"] = lintStagedConfig;
    }

    writePackageJson(cwd, pkg);

    return { addedPrepare, addedLintStaged, addedCheck };
}
