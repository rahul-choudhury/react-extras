## Commands

```bash
bun run build          # Build CLI to ./dist
bun run dev            # Run with watch mode
bun run check          # Lint and format with Biome
bun test               # Run all tests
bun test <file>        # Run single test file (e.g., bun test src/__tests__/detect-pm.test.ts)
```

## Architecture

This is a CLI tool (`react-extras`) that generates deployment and tooling configuration for React projects.

### Detection Pipeline

The CLI runs three detection modules in sequence, each returning a result with an `inferred` flag indicating confidence:

1. **detect-pm.ts** - Detects package manager by lock file presence (bun.lock → bun, pnpm-lock.yaml → pnpm, etc.)
2. **detect-framework.ts** - Detects framework (Next.js via config files/deps, Vite+TanStack via package.json)
3. **detect-tooling.ts** - Detects linter (Biome via biome.json or deps, ESLint/Prettier via deps)

### Template System

- **templates.ts** - Declares `TEMPLATE_GROUPS` (Deployment, Editor Setup, Pre-commit Hook, API Client), each with file definitions, optional packages, and package.json modifications
- **generators.ts** - Dynamic content generators (Dockerfile, deploy.yml, pre-commit hook, extensions.json, config.ts)
- **files.ts** - Resolves template groups against context, writes files to disk

Static templates live in `templates/`; most files are generated dynamically based on detection results. Next.js gets a standalone Node.js Dockerfile; Vite gets nginx-based static serving.

### Supporting Modules

- **next-config.ts** - Adds `output: "standalone"` to next.config via regex patterns
- **package-json.ts** - Adds scripts and config entries to the target project's package.json

### Entry Point

**index.ts** orchestrates the flow: detect → select template groups → show file list → prompt for overwrites → copy templates → update package.json → install deps.
