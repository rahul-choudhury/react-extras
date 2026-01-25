import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPMConfig, type PackageManager } from "./detect-pm.js";
import type { Tooling } from "./detect-tooling.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface TemplateFile {
    templatePath: string;
    targetPath: string;
    label: string;
}

export const TEMPLATE_FILES: TemplateFile[] = [
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
        templatePath: "Dockerfile",
        targetPath: "Dockerfile",
        label: "Dockerfile",
    },
    {
        templatePath: "nginx.conf",
        targetPath: "nginx.conf",
        label: "Nginx config",
    },
];

export function getTemplatesDir(): string {
    return join(__dirname, "..", "templates");
}

export function checkExistingFiles(
    cwd: string,
): { file: TemplateFile; exists: boolean }[] {
    return TEMPLATE_FILES.map((file) => ({
        file,
        exists: existsSync(join(cwd, file.targetPath)),
    }));
}

export function copyTemplateFile(
    cwd: string,
    templateFile: TemplateFile,
    pm: PackageManager,
    tooling: Tooling,
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
        content = generateDockerfile(pm);
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

function generateDockerfile(pm: PackageManager): string {
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

function generateExtensionsJson(tooling: Tooling): string {
    const extensions =
        tooling === "biome"
            ? ["bradlc.vscode-tailwindcss", "biomejs.biome"]
            : [
                  "bradlc.vscode-tailwindcss",
                  "dbaeumer.vscode-eslint",
                  "esbenp.prettier-vscode",
              ];

    return `${JSON.stringify({ recommendations: extensions }, null, 2)}\n`;
}
