# react-extras

A CLI tool that automates the setup of deployment, linting, and editor configuration for React applications.

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
2. Show a list of files that will be created
3. Prompt for confirmation before overwriting existing files
4. Generate configuration files
5. Install required dependencies (husky, lint-staged)

## Generated Files

| File | Description |
|------|-------------|
| `.github/workflows/deploy.yml` | GitHub Actions CI/CD workflow |
| `Dockerfile` | Multi-stage Docker build configuration |
| `.husky/pre-commit` | Pre-commit hook for linting |
| `.vscode/extensions.json` | Recommended VS Code extensions |
| `.editorconfig` | Editor configuration for consistent formatting |
| `nginx.conf` | Nginx configuration (Vite projects only) |

The CLI also updates your `package.json` with:

- `prepare` script for Husky initialization
- `typecheck` script for TypeScript compilation
- `check` script for running lint and format checks (Next.js only)
- `lint-staged` configuration

## Requirements

- Node.js >= 18
- An existing React project with `package.json`

## Supported Frameworks

- Next.js (automatically configures standalone output)
- Vite + TanStack Router
