import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

export type TemplateGroupId =
    | "deployment"
    | "editor-setup"
    | "pre-commit"
    | "api-client";

export type NextStepStage = "before-review" | "after-review";

export interface NextStepDefinition {
    text: string;
    stage?: NextStepStage;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "..", "templates");

function renderTemplate(templatePath: string) {
    return () => readFileSync(join(TEMPLATES_DIR, templatePath), "utf-8");
}

export interface PackageJsonMods {
    scripts?: Record<string, string>;
    config?: Record<string, unknown>;
}

export interface TemplateFileDefinition {
    targetPath: string | ((ctx: GeneratorContext) => string);
    render: (ctx: GeneratorContext) => string;
    executable?: boolean;
    when?: (ctx: GeneratorContext) => boolean;
}

export interface TemplateGroup {
    id: TemplateGroupId;
    label: string;
    files: TemplateFileDefinition[];
    packages?: string[];
    packageJson?:
        | PackageJsonMods
        | ((ctx: GeneratorContext) => PackageJsonMods);
    nextSteps?:
        | NextStepDefinition[]
        | ((ctx: GeneratorContext) => NextStepDefinition[]);
}

export const TEMPLATE_GROUPS: TemplateGroup[] = [
    {
        id: "deployment",
        label: "Deployment + CI/CD",
        files: [
            {
                targetPath: "Dockerfile",
                render: (ctx) =>
                    generateDockerfile(ctx.pm, ctx.framework, ctx.cwd),
            },
            {
                targetPath: ".github/workflows/deploy.yml",
                render: (ctx) => generateDeployYml(ctx.pm, ctx.cwd),
            },
            {
                targetPath: "nginx.conf",
                render: renderTemplate("nginx.conf"),
                when: (ctx) => ctx.framework !== "nextjs",
            },
        ],
        packageJson: (ctx) => ({
            scripts: {
                check: getCheckScript(ctx.tooling),
                typecheck: "tsc --noEmit",
            },
        }),
        nextSteps: (ctx) => [
            ...(ctx.framework === "nextjs"
                ? [
                      {
                          text: 'Add output: "standalone" to your next.config (required for Docker)',
                          stage: "before-review" as const,
                      },
                  ]
                : []),
            {
                text: "Update .github/workflows/deploy.yml with your settings",
            },
        ],
    },
    {
        id: "editor-setup",
        label: "Editor Setup",
        files: [
            {
                targetPath: ".editorconfig",
                render: renderTemplate("editorconfig"),
            },
            {
                targetPath: ".vscode/extensions.json",
                render: (ctx) => generateExtensionsJson(ctx.tooling),
            },
            {
                targetPath: ".zed/settings.json",
                render: renderTemplate("zed-settings.json"),
                when: (ctx) => ctx.tooling === "biome",
            },
        ],
    },
    {
        id: "pre-commit",
        label: "Pre-commit Hook",
        files: [
            {
                targetPath: ".husky/pre-commit",
                render: (ctx) => generatePreCommitHook(ctx.pm, ctx.cwd),
                executable: true,
            },
        ],
        packages: ["husky", "lint-staged"],
        packageJson: (ctx) => ({
            scripts: { prepare: "husky" },
            config: { "lint-staged": getLintStagedConfig(ctx.tooling) },
        }),
        nextSteps: [{ text: "Make a commit to test the pre-commit hook" }],
    },
    {
        id: "api-client",
        label: "API Client",
        files: [
            {
                targetPath: (ctx) =>
                    existsSync(join(ctx.cwd, "src"))
                        ? "src/lib/api-client.ts"
                        : "lib/api-client.ts",
                render: renderTemplate("lib/api-client.ts"),
            },
            {
                targetPath: (ctx) =>
                    existsSync(join(ctx.cwd, "src"))
                        ? "src/lib/config.ts"
                        : "lib/config.ts",
                render: (ctx) => generateConfigTs(ctx.framework),
            },
        ],
    },
];
