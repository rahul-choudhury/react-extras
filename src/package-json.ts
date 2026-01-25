import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LintStagedConfig } from "./detect-tooling.js";

export interface PackageJson {
    scripts?: Record<string, string>;
    "lint-staged"?: LintStagedConfig;
    [key: string]: unknown;
}

export function readPackageJson(cwd: string): PackageJson {
    const pkgPath = join(cwd, "package.json");
    return JSON.parse(readFileSync(pkgPath, "utf-8"));
}

export function writePackageJson(cwd: string, pkg: PackageJson): void {
    const pkgPath = join(cwd, "package.json");
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

export function updatePackageJson(
    cwd: string,
    lintStagedConfig: LintStagedConfig,
): { addedPrepare: boolean; addedLintStaged: boolean } {
    const pkg = readPackageJson(cwd);

    const addedPrepare = !pkg.scripts?.prepare;
    const addedLintStaged = !pkg["lint-staged"];

    if (!pkg.scripts) {
        pkg.scripts = {};
    }
    if (!pkg.scripts.prepare) {
        pkg.scripts.prepare = "husky";
    }
    if (!pkg.scripts.typecheck) {
        pkg.scripts.typecheck = "tsc --noEmit";
    }

    if (!pkg["lint-staged"]) {
        pkg["lint-staged"] = lintStagedConfig;
    }

    writePackageJson(cwd, pkg);

    return { addedPrepare, addedLintStaged };
}
