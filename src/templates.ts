import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Framework } from "./detect-framework.js";
import type { PackageManager } from "./detect-pm.js";
import { getLintStagedConfig, type Tooling } from "./detect-tooling.js";
import {
    generateConfigTs,
    generateDeployYml,
    generateDockerfile,
    generateExtensionsJson,
    generatePreCommitHook,
    getCheckScript,
} from "./generators.js";

export interface GeneratorContext {
    cwd: string;
    pm: PackageManager;
    tooling: Tooling;
    framework: Framework;
}

export type ContentResolver =
    | { type: "static"; templatePath: string }
    | { type: "dynamic"; generate: (ctx: GeneratorContext) => string };

export interface PackageJsonMods {
    scripts?: Record<string, string>;
    config?: Record<string, unknown>;
}

export interface TemplateFileDefinition {
    targetPath: string | ((ctx: GeneratorContext) => string);
    content: ContentResolver;
    when?: (ctx: GeneratorContext) => boolean;
}

export interface TemplateGroup {
    label: string;
    files: TemplateFileDefinition[];
    packages?: string[];
    packageJson?:
        | PackageJsonMods
        | ((ctx: GeneratorContext) => PackageJsonMods);
}

export const TEMPLATE_GROUPS: TemplateGroup[] = [
    {
        label: "Deployment + CI/CD",
        files: [
            {
                targetPath: "Dockerfile",
                content: {
                    type: "dynamic",
                    generate: (ctx) =>
                        generateDockerfile(ctx.pm, ctx.framework, ctx.cwd),
                },
            },
            {
                targetPath: ".github/workflows/deploy.yml",
                content: {
                    type: "dynamic",
                    generate: (ctx) => generateDeployYml(ctx.pm, ctx.cwd),
                },
            },
            {
                targetPath: "nginx.conf",
                content: { type: "static", templatePath: "nginx.conf" },
                when: (ctx) => ctx.framework !== "nextjs",
            },
        ],
        packageJson: (ctx) => ({
            scripts: {
                check: getCheckScript(ctx.tooling),
                typecheck: "tsc --noEmit",
            },
        }),
    },
    {
        label: "Editor Setup",
        files: [
            {
                targetPath: ".editorconfig",
                content: { type: "static", templatePath: "editorconfig" },
            },
            {
                targetPath: ".vscode/extensions.json",
                content: {
                    type: "dynamic",
                    generate: (ctx) => generateExtensionsJson(ctx.tooling),
                },
            },
            {
                targetPath: ".zed/settings.json",
                content: { type: "static", templatePath: "zed-settings.json" },
                when: (ctx) => ctx.tooling === "biome",
            },
        ],
    },
    {
        label: "Pre-commit Hook",
        files: [
            {
                targetPath: ".husky/pre-commit",
                content: {
                    type: "dynamic",
                    generate: (ctx) => generatePreCommitHook(ctx.pm, ctx.cwd),
                },
            },
        ],
        packages: ["husky", "lint-staged"],
        packageJson: (ctx) => ({
            scripts: { prepare: "husky" },
            config: { "lint-staged": getLintStagedConfig(ctx.tooling) },
        }),
    },
    {
        label: "API Client",
        files: [
            {
                targetPath: (ctx) =>
                    existsSync(join(ctx.cwd, "src"))
                        ? "src/lib/api-client.ts"
                        : "lib/api-client.ts",
                content: { type: "static", templatePath: "lib/api-client.ts" },
            },
            {
                targetPath: (ctx) =>
                    existsSync(join(ctx.cwd, "src"))
                        ? "src/lib/config.ts"
                        : "lib/config.ts",
                content: {
                    type: "dynamic",
                    generate: (ctx) => generateConfigTs(ctx.framework),
                },
            },
        ],
    },
];
