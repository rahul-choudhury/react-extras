import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Framework } from "./detect-framework.js";
import { getPMConfig, type PackageManager } from "./detect-pm.js";
import type { Tooling } from "./detect-tooling.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface TemplateFile {
    templatePath: string;
    targetPath: string;
    label: string;
}

const BASE_TEMPLATE_FILES: TemplateFile[] = [
    {
        templatePath: "github/workflows/deploy.yml",
        targetPath: ".github/workflows/deploy.yml",
        label: "GitHub Actions workflow",
    },
    {
        templatePath: "husky/pre-commit",
        targetPath: ".husky/pre-commit",
        label: "Husky pre-commit hook",
    },
    {
        templatePath: "vscode/extensions.json",
        targetPath: ".vscode/extensions.json",
        label: "VS Code extensions",
    },
    {
        templatePath: "editorconfig",
        targetPath: ".editorconfig",
        label: "EditorConfig",
    },
    {
        templatePath: "Dockerfile",
        targetPath: "Dockerfile",
        label: "Dockerfile",
    },
    {
        templatePath: "lib/api-client.ts",
        targetPath: "src/lib/api-client.ts",
        label: "API client",
    },
];

const NGINX_TEMPLATE: TemplateFile = {
    templatePath: "nginx.conf",
    targetPath: "nginx.conf",
    label: "Nginx config",
};

export function getTemplateFiles(framework: Framework): TemplateFile[] {
    if (framework === "nextjs") {
        return [...BASE_TEMPLATE_FILES];
    }

    return [...BASE_TEMPLATE_FILES, NGINX_TEMPLATE];
}

export function getTemplatesDir(): string {
    return join(__dirname, "..", "templates");
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

    let content: string;
    if (templateFile.targetPath === ".github/workflows/deploy.yml") {
        content = generateDeployYml(pm);
    } else if (templateFile.targetPath === "Dockerfile") {
        content = generateDockerfile(pm, framework);
    } else if (templateFile.targetPath === ".vscode/extensions.json") {
        content = generateExtensionsJson(tooling);
    } else {
        const templatesDir = getTemplatesDir();
        const sourcePath = join(templatesDir, templateFile.templatePath);
        content = readFileSync(sourcePath, "utf-8");
    }

    writeFileSync(targetPath, content);
}

function generateDeployYml(pm: PackageManager): string {
    const config = getPMConfig(pm);
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

function generateDockerfile(pm: PackageManager, framework: Framework): string {
    if (framework === "nextjs") {
        return generateNextjsDockerfile(pm);
    }
    return generateViteDockerfile(pm);
}

function generateViteDockerfile(pm: PackageManager): string {
    const config = getPMConfig(pm);
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

function generateNextjsDockerfile(pm: PackageManager): string {
    const config = getPMConfig(pm);

    // Package manager specific setup for deps stage
    let depsSetup: string;
    let depsCopy: string;
    let depsInstall: string;

    // Package manager specific setup for builder stage
    let builderSetup: string;
    let builderRun: string;

    switch (pm) {
        case "pnpm":
            depsSetup = "RUN corepack enable pnpm\n";
            depsCopy = "COPY package.json pnpm-lock.yaml ./";
            depsInstall = "RUN pnpm install --frozen-lockfile";
            builderSetup = "RUN corepack enable pnpm\n";
            builderRun = "RUN pnpm run build";
            break;
        case "yarn":
            depsSetup = "RUN corepack enable yarn\n";
            depsCopy = "COPY package.json yarn.lock ./";
            depsInstall = "RUN yarn install --frozen-lockfile";
            builderSetup = "RUN corepack enable yarn\n";
            builderRun = "RUN yarn build";
            break;
        case "bun":
            depsSetup = "";
            depsCopy = "COPY package.json bun.lock ./";
            depsInstall = "RUN bun install --frozen-lockfile";
            builderSetup = "";
            builderRun = "RUN bun run build";
            break;
        default:
            depsSetup = "";
            depsCopy = "COPY package.json package-lock.json ./";
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
