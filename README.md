# react-extras

A CLI tool that adds deployment, editor, pre-commit, and API client setup to supported React projects.

## Installation

```bash
npm install -g @rahul-choudhury/react-extras
```

Or run directly with npx:

```bash
npx @rahul-choudhury/react-extras
```

## Usage

Navigate to your React project directory and run:

```bash
react-extras
```

The CLI will:

1. Detect your package manager, framework, and linting tools
2. Build a list of available extras for the detected project
3. Let you choose which extras to add
4. Show which files will be created and prompt before overwriting existing files
5. Generate the selected files, update `package.json`, and install any required dependencies

## Available Extras

| Extra | Files / changes |
|------|-------------|
| `Deployment + CI/CD` | `Dockerfile`, `.github/workflows/deploy.yml`, and `nginx.conf` for Vite projects |
| `Editor Setup` | `.vscode/extensions.json` and tooling-aware `.zed/settings.json` for all supported projects, plus `.vscode/settings.json` for Next.js projects |
| `Pre-commit Hook` | `.husky/pre-commit`, `prepare` script, `lint-staged` config, and installs `husky` + `lint-staged` |
| `API Client` | `lib/api-client.ts` and `lib/config.ts` or `src/lib/*` when a `src/` directory exists |

The CLI also updates your `package.json` with:

- `check` and `typecheck` scripts when `Deployment + CI/CD` is selected
- `prepare` script and `lint-staged` config when `Pre-commit Hook` is selected

The generated `check` script depends on detected tooling:

- Biome: `biome check .`
- ESLint + Prettier: `eslint . && prettier --check .`

The generated Zed settings also depend on detected tooling:

- Biome: uses the Biome language server as the formatter and runs Biome fix/import actions on format
- ESLint + Prettier: disables Biome language servers for supported frontend languages

## Requirements

- Node.js >= 18
- Bun >= 1 for local development of this CLI
- An existing React project with `package.json`

## Supported Frameworks

- Next.js (manually add `output: "standalone"` if you select `Deployment + CI/CD`)
- Vite + TanStack Router ([Quick Start](https://tanstack.com/router/v1/docs/framework/react/quick-start))

## Detection Rules

- Package manager: detected from lock files in this order: Bun, pnpm, Yarn, npm
- Framework: Next.js via `next.config.*` or the `next` dependency; otherwise Vite + TanStack Router via `vite` and `@tanstack/react-router`
- Tooling: Biome via `biome.json`, `biome.jsonc`, or `@biomejs/biome`; otherwise ESLint + Prettier via dependencies
