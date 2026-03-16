import { existsSync } from "node:fs";
import { join } from "node:path";

export type PackageManager = "bun" | "pnpm" | "yarn" | "npm";

export interface PMDetectionResult {
    pm: PackageManager;
    inferred: boolean;
}

const PM_DETECTION_ORDER: PackageManager[] = ["bun", "pnpm", "yarn", "npm"];

export interface PMConfig {
    setupAction: string;
    install: string;
    run: string;
    runX: string;
    lockfile: string;
    dockerBase: string;
    frozenInstall: string;
}

interface PMConfigOptions {
    cwd?: string;
}

interface PMMetadata {
    detectLockFiles: string[];
    installCommand: (packages: string[]) => string;
    skillsInstallCommand: string;
    getConfig: (options: { cwd: string; nodeVersion: string }) => PMConfig;
}

function getNodeMajorVersion(): string {
    const version =
        typeof process.versions?.node === "string"
            ? process.versions.node
            : process.version;
    return version.split(".")[0].replace("v", "");
}

function getSetupNodeAction(
    nodeVersion: string,
    cache: "yarn" | "npm",
): string {
    return `uses: actions/setup-node@v4\n        with:\n          node-version: ${nodeVersion}\n          cache: ${cache}`;
}

const PM_METADATA: Record<PackageManager, PMMetadata> = {
    bun: {
        detectLockFiles: ["bun.lock", "bun.lockb"],
        installCommand: (packages) => `bun add -D ${packages.join(" ")}`,
        skillsInstallCommand: "bunx --bun skills add shadcn/ui",
        getConfig: ({ cwd }) => ({
            setupAction: "uses: oven-sh/setup-bun@v2",
            install: "bun install",
            run: "bun run",
            runX: "bun run",
            lockfile: existsSync(join(cwd, "bun.lockb"))
                ? "bun.lockb"
                : "bun.lock",
            dockerBase: "oven/bun:alpine",
            frozenInstall: "bun install --frozen-lockfile",
        }),
    },
    pnpm: {
        detectLockFiles: ["pnpm-lock.yaml"],
        installCommand: (packages) => `pnpm add -D ${packages.join(" ")}`,
        skillsInstallCommand: "pnpm dlx skills add shadcn/ui",
        getConfig: ({ nodeVersion }) => ({
            setupAction: "uses: pnpm/action-setup@v4",
            install: "pnpm install",
            run: "pnpm",
            runX: "pnpm exec",
            lockfile: "pnpm-lock.yaml",
            dockerBase: `node:${nodeVersion}-alpine`,
            frozenInstall: "corepack enable && pnpm install --frozen-lockfile",
        }),
    },
    yarn: {
        detectLockFiles: ["yarn.lock"],
        installCommand: (packages) => `yarn add -D ${packages.join(" ")}`,
        skillsInstallCommand: "yarn skills add shadcn/ui",
        getConfig: ({ nodeVersion }) => ({
            setupAction: getSetupNodeAction(nodeVersion, "yarn"),
            install: "yarn install",
            run: "yarn",
            runX: "yarn run",
            lockfile: "yarn.lock",
            dockerBase: `node:${nodeVersion}-alpine`,
            frozenInstall: "corepack enable && yarn install --frozen-lockfile",
        }),
    },
    npm: {
        detectLockFiles: ["package-lock.json"],
        installCommand: (packages) => `npm install -D ${packages.join(" ")}`,
        skillsInstallCommand: "npx skills add shadcn/ui",
        getConfig: ({ nodeVersion }) => ({
            setupAction: getSetupNodeAction(nodeVersion, "npm"),
            install: "npm ci",
            run: "npm run",
            runX: "npx",
            lockfile: "package-lock.json",
            dockerBase: `node:${nodeVersion}-alpine`,
            frozenInstall: "npm ci",
        }),
    },
};

export function detectPackageManager(cwd: string): PMDetectionResult {
    for (const pm of PM_DETECTION_ORDER) {
        for (const lockFile of PM_METADATA[pm].detectLockFiles) {
            if (existsSync(join(cwd, lockFile))) {
                return { pm, inferred: false };
            }
        }
    }

    return { pm: "npm", inferred: true };
}

export function getInstallCommand(
    pm: PackageManager,
    packages: string[],
): string {
    return PM_METADATA[pm].installCommand(packages);
}

export function getSkillsInstallCommand(pm: PackageManager): string {
    return PM_METADATA[pm].skillsInstallCommand;
}

export function getPMConfig(
    pm: PackageManager,
    options: PMConfigOptions = {},
): PMConfig {
    const nodeVersion = getNodeMajorVersion();
    const cwd = options.cwd ?? process.cwd();

    return PM_METADATA[pm].getConfig({ cwd, nodeVersion });
}
