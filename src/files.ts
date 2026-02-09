import {
    chmodSync,
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Framework } from "./detect-framework.js";
import { getPMConfig, type PackageManager } from "./detect-pm.js";
import { getLintStagedConfig, type Tooling } from "./detect-tooling.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getCheckScript(tooling: Tooling): string {
    return tooling === "biome"
        ? "biome check ."
        : "eslint . && prettier --check .";
}

export interface GeneratorContext {
    cwd: string;
    pm: PackageManager;
    tooling: Tooling;
    framework: Framework;
}

type ContentResolver =
    | { type: "static"; templatePath: string }
    | { type: "dynamic"; generate: (ctx: GeneratorContext) => string };

export interface PackageJsonMods {
    scripts?: Record<string, string | ((ctx: GeneratorContext) => string)>;
    config?: Record<string, unknown | ((ctx: GeneratorContext) => unknown)>;
}

interface TemplateDefinition {
    targetPath: string | ((ctx: GeneratorContext) => string);
    label: string;
    content: ContentResolver;
    when?: (ctx: GeneratorContext) => boolean;
    devDependencies?: string[];
    packageJson?:
        | PackageJsonMods
        | ((ctx: GeneratorContext) => PackageJsonMods);
}

type PackageJsonResolver =
    | PackageJsonMods
    | ((ctx: GeneratorContext) => PackageJsonMods);

export interface TemplateFile {
    templatePath: string;
    targetPath: string;
    label: string;
    devDependencies: string[];
    packageJson?: PackageJsonResolver;
}

const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
    {
        targetPath: ".github/workflows/deploy.yml",
        label: "GitHub Actions workflow",
        content: {
            type: "dynamic",
            generate: (ctx) => generateDeployYml(ctx.pm, ctx.cwd),
        },
        packageJson: (ctx) => ({
            scripts: {
                check: getCheckScript(ctx.tooling),
                typecheck: "tsc --noEmit",
            },
        }),
    },
    {
        targetPath: ".husky/pre-commit",
        label: "Husky pre-commit hook",
        content: {
            type: "dynamic",
            generate: (ctx) => generatePreCommitHook(ctx.pm, ctx.cwd),
        },
        devDependencies: ["husky", "lint-staged"],
        packageJson: (ctx) => ({
            scripts: { prepare: "husky" },
            config: { "lint-staged": getLintStagedConfig(ctx.tooling) },
        }),
    },
    {
        targetPath: ".vscode/extensions.json",
        label: "VS Code extensions",
        content: {
            type: "dynamic",
            generate: (ctx) => generateExtensionsJson(ctx.tooling),
        },
    },
    {
        targetPath: ".zed/settings.json",
        label: "Zed settings",
        content: {
            type: "dynamic",
            generate: () => generateZedSettingsJson(),
        },
        when: (ctx) => ctx.tooling === "biome",
    },
    {
        targetPath: ".editorconfig",
        label: "EditorConfig",
        content: { type: "static", templatePath: "editorconfig" },
    },
    {
        targetPath: "Dockerfile",
        label: "Dockerfile",
        content: {
            type: "dynamic",
            generate: (ctx) =>
                generateDockerfile(ctx.pm, ctx.framework, ctx.cwd),
        },
    },
    {
        targetPath: (ctx) =>
            existsSync(join(ctx.cwd, "src"))
                ? "src/lib/api-client.ts"
                : "lib/api-client.ts",
        label: "API client",
        content: { type: "static", templatePath: "lib/api-client.ts" },
    },
    {
        targetPath: (ctx) =>
            existsSync(join(ctx.cwd, "src"))
                ? "src/lib/config.ts"
                : "lib/config.ts",
        label: "API config",
        content: {
            type: "dynamic",
            generate: (ctx) => generateConfigTs(ctx.framework),
        },
    },
    {
        targetPath: "nginx.conf",
        label: "Nginx config",
        content: { type: "static", templatePath: "nginx.conf" },
        when: (ctx) => ctx.framework !== "nextjs",
    },
];

export function getTemplateFiles(
    cwd: string,
    framework: Framework,
    tooling: Tooling = "eslint-prettier",
): TemplateFile[] {
    const ctx: GeneratorContext = {
        cwd,
        pm: "npm",
        tooling,
        framework,
    };

    return TEMPLATE_DEFINITIONS.filter((def) => !def.when || def.when(ctx)).map(
        (def) => {
            const targetPath =
                typeof def.targetPath === "function"
                    ? def.targetPath(ctx)
                    : def.targetPath;
            return {
                templatePath:
                    def.content.type === "static"
                        ? def.content.templatePath
                        : targetPath,
                targetPath,
                label: def.label,
                devDependencies: def.devDependencies ?? [],
                packageJson: def.packageJson,
            };
        },
    );
}

export function getTemplatesDir(): string {
    return join(__dirname, "..", "templates");
}

export function getRequiredDependencies(
    templateFiles: TemplateFile[],
): string[] {
    const deps = new Set<string>();
    for (const file of templateFiles) {
        for (const dep of file.devDependencies) {
            deps.add(dep);
        }
    }
    return [...deps];
}

export interface ResolvedPackageJsonMods {
    scripts: Record<string, string>;
    config: Record<string, unknown>;
}

export function getPackageJsonMods(
    templateFiles: TemplateFile[],
    ctx: GeneratorContext,
): ResolvedPackageJsonMods {
    const scripts: Record<string, string> = {};
    const config: Record<string, unknown> = {};

    for (const file of templateFiles) {
        if (!file.packageJson) continue;

        const mods =
            typeof file.packageJson === "function"
                ? file.packageJson(ctx)
                : file.packageJson;

        if (mods.scripts) {
            for (const [key, value] of Object.entries(mods.scripts)) {
                if (!(key in scripts)) {
                    scripts[key] =
                        typeof value === "function" ? value(ctx) : value;
                }
            }
        }

        if (mods.config) {
            for (const [key, value] of Object.entries(mods.config)) {
                if (!(key in config)) {
                    config[key] =
                        typeof value === "function" ? value(ctx) : value;
                }
            }
        }
    }

    return { scripts, config };
}

export function checkExistingFiles(
    cwd: string,
    templateFiles: TemplateFile[],
): { file: TemplateFile; exists: boolean }[] {
    return templateFiles.map((file) => ({
        file,
        exists: existsSync(join(cwd, file.targetPath)),
    }));
}

export function copyTemplateFile(
    cwd: string,
    templateFile: TemplateFile,
    pm: PackageManager,
    tooling: Tooling,
    framework: Framework,
): void {
    const targetPath = join(cwd, templateFile.targetPath);
    const targetDir = dirname(targetPath);

    if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
    }

    const ctx: GeneratorContext = { cwd, pm, tooling, framework };
    const def = TEMPLATE_DEFINITIONS.find((d) => {
        const resolvedPath =
            typeof d.targetPath === "function"
                ? d.targetPath(ctx)
                : d.targetPath;
        return resolvedPath === templateFile.targetPath;
    });
    if (!def) {
        throw new Error(`Unknown template: ${templateFile.targetPath}`);
    }

    const content = resolveContent(def.content, ctx);
    writeFileSync(targetPath, content);
    if (templateFile.targetPath.startsWith(".husky/")) {
        try {
            chmodSync(targetPath, 0o755);
        } catch {}
    }
}

function resolveContent(
    resolver: ContentResolver,
    ctx: GeneratorContext,
): string {
    if (resolver.type === "dynamic") {
        return resolver.generate(ctx);
    }
    const templatesDir = getTemplatesDir();
    return readFileSync(join(templatesDir, resolver.templatePath), "utf-8");
}

function generateDeployYml(pm: PackageManager, cwd: string): string {
    const config = getPMConfig(pm, { cwd });
    return `name: Deploy
on:
  push:
    branches: ["main"]
env:
  REGISTRY: ghcr.io
  IMAGE_NAME: \${{ github.repository }}

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - ${config.setupAction}
      - run: ${config.install}
      - run: ${config.run} check
      - run: ${config.run} typecheck

  deploy:
    needs: checks
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - name: Login to ghcr.io
        uses: docker/login-action@v2
        with:
          registry: \${{ env.REGISTRY }}
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      - name: Build image and push to registry
        uses: docker/build-push-action@v6
        with:
          context: .
          file: Dockerfile
          platforms: linux/amd64
          push: true
          tags: \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:latest
      # Uncomment below after setting up your coolify instance.
      # - name: Deploy to Coolify
      #   run: |
      #     curl --request GET '\${{ secrets.COOLIFY_WEBHOOK }}' --header 'Authorization: Bearer \${{ secrets.COOLIFY_TOKEN }}'
`;
}

function generateDockerfile(
    pm: PackageManager,
    framework: Framework,
    cwd: string,
): string {
    if (framework === "nextjs") {
        return generateNextjsDockerfile(pm, cwd);
    }
    return generateViteDockerfile(pm, cwd);
}

function generateViteDockerfile(pm: PackageManager, cwd: string): string {
    const config = getPMConfig(pm, { cwd });
    return `FROM ${config.dockerBase} AS base

FROM base AS deps
WORKDIR /app
COPY package.json ${config.lockfile} ./
RUN ${config.frozenInstall}

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN ${config.run} build

FROM nginx:alpine AS runner
WORKDIR /usr/share/nginx/html
RUN rm -rf ./*
COPY --from=builder /app/dist .
COPY --from=builder /app/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`;
}

function generateNextjsDockerfile(pm: PackageManager, cwd: string): string {
    const config = getPMConfig(pm, { cwd });

    let depsSetup: string;
    let depsCopy: string;
    let depsInstall: string;
    let builderSetup: string;
    let builderRun: string;

    switch (pm) {
        case "pnpm":
            depsSetup = "RUN corepack enable pnpm\n";
            depsCopy = `COPY package.json ${config.lockfile} ./`;
            depsInstall = "RUN pnpm install --frozen-lockfile";
            builderSetup = "RUN corepack enable pnpm\n";
            builderRun = "RUN pnpm run build";
            break;
        case "yarn":
            depsSetup = "RUN corepack enable yarn\n";
            depsCopy = `COPY package.json ${config.lockfile} ./`;
            depsInstall = "RUN yarn install --frozen-lockfile";
            builderSetup = "RUN corepack enable yarn\n";
            builderRun = "RUN yarn build";
            break;
        case "bun":
            depsSetup = "";
            depsCopy = `COPY package.json ${config.lockfile} ./`;
            depsInstall = "RUN bun install --frozen-lockfile";
            builderSetup = "";
            builderRun = "RUN bun run build";
            break;
        default:
            depsSetup = "";
            depsCopy = `COPY package.json ${config.lockfile} ./`;
            depsInstall = "RUN npm ci";
            builderSetup = "";
            builderRun = "RUN npm run build";
            break;
    }

    return `FROM ${config.dockerBase} AS base

FROM base AS deps
WORKDIR /app
${depsSetup}${depsCopy}
${depsInstall}

FROM base AS builder
WORKDIR /app
${builderSetup}COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
${builderRun}

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
`;
}

function generatePreCommitHook(pm: PackageManager, cwd: string): string {
    const config = getPMConfig(pm, { cwd });
    return `#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

${config.runX} lint-staged
`;
}

function generateExtensionsJson(tooling: Tooling): string {
    const extensions =
        tooling === "biome"
            ? [
                  "bradlc.vscode-tailwindcss",
                  "biomejs.biome",
                  "EditorConfig.EditorConfig",
              ]
            : [
                  "bradlc.vscode-tailwindcss",
                  "dbaeumer.vscode-eslint",
                  "esbenp.prettier-vscode",
                  "EditorConfig.EditorConfig",
              ];

    return `${JSON.stringify({ recommendations: extensions }, null, 2)}\n`;
}

function generateZedSettingsJson(): string {
    const settings = {
        languages: {
            JavaScript: {
                language_servers: ["biome", "vtsls"],
                formatter: { language_server: { name: "biome" } },
                code_actions_on_format: {
                    "source.fixAll.biome": true,
                    "source.organizeImports.biome": true,
                },
            },
            TypeScript: {
                language_servers: ["biome", "vtsls"],
                formatter: { language_server: { name: "biome" } },
                code_actions_on_format: {
                    "source.fixAll.biome": true,
                    "source.organizeImports.biome": true,
                },
            },
            TSX: {
                language_servers: [
                    "biome",
                    "vtsls",
                    "tailwindcss-language-server",
                ],
                formatter: { language_server: { name: "biome" } },
                code_actions_on_format: {
                    "source.fixAll.biome": true,
                    "source.organizeImports.biome": true,
                },
            },
            JSON: {
                language_servers: ["biome", "json-language-server"],
                formatter: { language_server: { name: "biome" } },
                code_actions_on_format: {
                    "source.fixAll.biome": true,
                    "source.organizeImports.biome": true,
                },
            },
            JSONC: {
                language_servers: ["biome", "json-language-server"],
                formatter: { language_server: { name: "biome" } },
                code_actions_on_format: {
                    "source.fixAll.biome": true,
                    "source.organizeImports.biome": true,
                },
            },
            CSS: {
                language_servers: ["biome", "vscode-css-language-server"],
                formatter: { language_server: { name: "biome" } },
                code_actions_on_format: {
                    "source.fixAll.biome": true,
                },
            },
        },
    };
    return `${JSON.stringify(settings, null, 2)}\n`;
}

function generateConfigTs(framework: Framework): string {
    if (framework === "nextjs") {
        return `export const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
`;
    }

    return `export const apiBaseUrl =
    import.meta.env.VITE_API_BASE_URL ?? "";
`;
}
