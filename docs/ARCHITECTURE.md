# Architecture

`react-extras` is a CLI that detects a React project's stack, lets the user choose setup extras, then generates files, updates `package.json`, and installs any required dependencies.

## Detection Flow

The CLI builds context in three stages:

1. Package manager detection from lock files
2. Framework detection for Next.js or Vite + TanStack Router
3. Tooling detection for Biome or ESLint + Prettier

Each detector can return whether the result was inferred so the rest of the flow can handle uncertain matches conservatively.

## Template Resolution

Setup options are organized into template groups:

- Deployment + CI/CD
- Editor Setup
- Pre-commit Hook
- API Client

Some outputs come from static files in `templates/`, while others are generated dynamically from the detected package manager, framework, and tooling choices.

## Main Modules

- `src/index.ts` orchestrates the interactive CLI flow
- `src/templates.ts` defines template groups and metadata
- `src/generators.ts` builds dynamic file content such as Dockerfiles and workflow files
- `src/files.ts` resolves selected groups into concrete file operations
- `src/package-json.ts` applies `package.json` updates without overwriting existing user-defined entries
