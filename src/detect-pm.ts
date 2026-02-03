import { existsSync } from "node:fs";
import { join } from "node:path";

export type PackageManager = "bun" | "pnpm" | "yarn" | "npm";

export interface PMDetectionResult {
    pm: PackageManager;
    inferred: boolean;
}

const LOCK_FILES: Record<string, PackageManager> = {
    "bun.lock": "bun",
    "bun.lockb": "bun",
    "pnpm-lock.yaml": "pnpm",
    "yarn.lock": "yarn",
    "package-lock.json": "npm",
};

export function detectPackageManager(cwd: string): PMDetectionResult {
    for (const [lockFile, pm] of Object.entries(LOCK_FILES)) {
        if (existsSync(join(cwd, lockFile))) {
            return { pm, inferred: false };
        }
    }
    return { pm: "npm", inferred: true };
}

export function getInstallCommand(
    pm: PackageManager,
    packages: string[],
): string {
    const pkgList = packages.join(" ");
    switch (pm) {
        case "bun":
            return `bun add -D ${pkgList}`;
        case "pnpm":
            return `pnpm add -D ${pkgList}`;
        case "yarn":
            return `yarn add -D ${pkgList}`;
        case "npm":
            return `npm install -D ${pkgList}`;
    }
}

export interface PMConfig {
    setupAction: string;
    install: string;
    run: string;
    runX: string;
    lockfile: string;
    dockerBase: string;
    frozenInstall: string;
}

export interface PMConfigOptions {
    cwd?: string;
}

function getNodeMajorVersion(): string {
    return process.version.split(".")[0].replace("v", "");
}

export function getPMConfig(
    pm: PackageManager,
    options: PMConfigOptions = {},
): PMConfig {
    const nodeVersion = getNodeMajorVersion();
    const cwd = options.cwd ?? process.cwd();
    const bunLockfile = existsSync(join(cwd, "bun.lockb"))
        ? "bun.lockb"
        : "bun.lock";

    switch (pm) {
        case "bun":
            return {
                setupAction: "uses: oven-sh/setup-bun@v2",
                install: "bun install",
                run: "bun run",
                runX: "bun run",
                lockfile: bunLockfile,
                dockerBase: "oven/bun:alpine",
                frozenInstall: "bun install --frozen-lockfile",
            };
        case "pnpm":
            return {
                setupAction: "uses: pnpm/action-setup@v4",
                install: "pnpm install",
                run: "pnpm",
                runX: "pnpm exec",
                lockfile: "pnpm-lock.yaml",
                dockerBase: `node:${nodeVersion}-alpine`,
                frozenInstall:
                    "corepack enable && pnpm install --frozen-lockfile",
            };
        case "yarn":
            return {
                setupAction: `uses: actions/setup-node@v4\n        with:\n          node-version: ${nodeVersion}\n          cache: yarn`,
                install: "yarn install",
                run: "yarn",
                runX: "yarn run",
                lockfile: "yarn.lock",
                dockerBase: `node:${nodeVersion}-alpine`,
                frozenInstall:
                    "corepack enable && yarn install --frozen-lockfile",
            };
        case "npm":
            return {
                setupAction: `uses: actions/setup-node@v4\n        with:\n          node-version: ${nodeVersion}\n          cache: npm`,
                install: "npm ci",
                run: "npm run",
                runX: "npx",
                lockfile: "package-lock.json",
                dockerBase: `node:${nodeVersion}-alpine`,
                frozenInstall: "npm ci",
            };
    }
}
