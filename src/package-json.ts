import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ResolvedPackageJsonMods } from "./files.js";

interface PackageJson {
    scripts?: Record<string, string>;
    [key: string]: unknown;
}

interface UpdatePackageJsonOptions {
    cwd: string;
    mods: ResolvedPackageJsonMods;
}

interface UpdatePackageJsonResult {
    added: string[];
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
    options: UpdatePackageJsonOptions,
): UpdatePackageJsonResult {
    const { cwd, mods } = options;
    const pkg = readPackageJson(cwd);
    const added: string[] = [];
    let changed = false;

    const scriptEntries = Object.entries(mods.scripts);
    if (scriptEntries.length > 0 && !pkg.scripts) {
        pkg.scripts = {};
    }

    for (const [key, value] of scriptEntries) {
        if (!pkg.scripts?.[key]) {
            pkg.scripts = pkg.scripts ?? {};
            pkg.scripts[key] = value;
            added.push(`${key} script`);
            changed = true;
        }
    }

    for (const [key, value] of Object.entries(mods.config)) {
        if (!(key in pkg)) {
            pkg[key] = value;
            added.push(`${key} config`);
            changed = true;
        }
    }

    if (changed) {
        writePackageJson(cwd, pkg);
    }

    return { added };
}
