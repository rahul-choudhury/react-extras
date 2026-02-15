import type { Framework } from "./detect-framework.js";
import { getPMConfig, type PackageManager } from "./detect-pm.js";
import type { Tooling } from "./detect-tooling.js";

export function getCheckScript(tooling: Tooling): string {
    return tooling === "biome"
        ? "biome check ."
        : "eslint . && prettier --check .";
}

export function generateDeployYml(pm: PackageManager, cwd: string): string {
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

export function generateDockerfile(
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

    const depsSetup = "";
    const depsCopy = `COPY package.json ${config.lockfile} ./`;
    const depsInstall = `RUN ${config.frozenInstall}`;
    const builderSetup =
        pm === "pnpm" || pm === "yarn" ? `RUN corepack enable ${pm}\n` : "";
    const builderRun = `RUN ${config.run} build`;

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

export function generatePreCommitHook(pm: PackageManager, cwd: string): string {
    const config = getPMConfig(pm, { cwd });
    return `#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

${config.runX} lint-staged
`;
}

export function generateExtensionsJson(tooling: Tooling): string {
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

export function generateConfigTs(framework: Framework): string {
    if (framework === "nextjs") {
        return `export const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
`;
    }

    return `export const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? "";
`;
}
