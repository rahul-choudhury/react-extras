import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    buildSetupPlan,
    checkExistingFiles,
    copyFile,
    type GeneratorContext,
    getPackageJsonMods,
    getRequiredPackages,
    getTemplatesDir,
    resolveGroups,
} from "../files.js";

describe("resolveGroups", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "files-test-"));
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    test("returns 4 groups for nextjs+biome", () => {
        const ctx: GeneratorContext = {
            cwd: tempDir,
            pm: "npm",
            tooling: "biome",
            framework: "nextjs",
        };
        const groups = resolveGroups(ctx);

        expect(groups).toHaveLength(4);
        const labels = groups.map((g) => g.label);
        const ids = groups.map((g) => g.id);
        expect(ids).toContain("deployment");
        expect(ids).toContain("editor-setup");
        expect(ids).toContain("pre-commit");
        expect(ids).toContain("api-client");
        expect(labels).toContain("Deployment + CI/CD");
        expect(labels).toContain("Editor Setup");
        expect(labels).toContain("Pre-commit Hook");
        expect(labels).toContain("API Client");
    });

    test("Deployment + CI/CD contains Dockerfile and deploy.yml for nextjs (no nginx.conf)", () => {
        const ctx: GeneratorContext = {
            cwd: tempDir,
            pm: "npm",
            tooling: "biome",
            framework: "nextjs",
        };
        const groups = resolveGroups(ctx);
        const deploy = groups.find((g) => g.label === "Deployment + CI/CD");

        if (!deploy) throw new Error("expected group");
        const paths = deploy.files.map((f) => f.targetPath);
        expect(paths).toContain("Dockerfile");
        expect(paths).toContain(".github/workflows/deploy.yml");
        expect(paths).not.toContain("nginx.conf");
    });

    test("Deployment + CI/CD contains Dockerfile, deploy.yml, and nginx.conf for vite-tanstack-router", () => {
        const ctx: GeneratorContext = {
            cwd: tempDir,
            pm: "npm",
            tooling: "biome",
            framework: "vite-tanstack-router",
        };
        const groups = resolveGroups(ctx);
        const deploy = groups.find((g) => g.label === "Deployment + CI/CD");

        if (!deploy) throw new Error("expected group");
        const paths = deploy.files.map((f) => f.targetPath);
        expect(paths).toContain("Dockerfile");
        expect(paths).toContain(".github/workflows/deploy.yml");
        expect(paths).toContain("nginx.conf");
    });

    test("Editor Setup includes .zed/settings.json when tooling is biome", () => {
        const ctx: GeneratorContext = {
            cwd: tempDir,
            pm: "npm",
            tooling: "biome",
            framework: "nextjs",
        };
        const groups = resolveGroups(ctx);
        const editor = groups.find((g) => g.label === "Editor Setup");

        if (!editor) throw new Error("expected group");
        const paths = editor.files.map((f) => f.targetPath);
        expect(paths).toContain(".zed/settings.json");
    });

    test("Editor Setup excludes .zed/settings.json when tooling is eslint-prettier", () => {
        const ctx: GeneratorContext = {
            cwd: tempDir,
            pm: "npm",
            tooling: "eslint-prettier",
            framework: "nextjs",
        };
        const groups = resolveGroups(ctx);
        const editor = groups.find((g) => g.label === "Editor Setup");

        if (!editor) throw new Error("expected group");
        const paths = editor.files.map((f) => f.targetPath);
        expect(paths).not.toContain(".zed/settings.json");
    });

    test("API Client uses lib/ paths when no src directory exists", () => {
        const ctx: GeneratorContext = {
            cwd: tempDir,
            pm: "npm",
            tooling: "biome",
            framework: "nextjs",
        };
        const groups = resolveGroups(ctx);
        const apiClient = groups.find((g) => g.label === "API Client");

        if (!apiClient) throw new Error("expected group");
        const paths = apiClient.files.map((f) => f.targetPath);
        expect(paths).toContain("lib/api-client.ts");
        expect(paths).toContain("lib/config.ts");
    });

    test("API Client uses src/lib/ paths when src directory exists", () => {
        mkdirSync(join(tempDir, "src"));
        const ctx: GeneratorContext = {
            cwd: tempDir,
            pm: "npm",
            tooling: "biome",
            framework: "nextjs",
        };
        const groups = resolveGroups(ctx);
        const apiClient = groups.find((g) => g.label === "API Client");

        if (!apiClient) throw new Error("expected group");
        const paths = apiClient.files.map((f) => f.targetPath);
        expect(paths).toContain("src/lib/api-client.ts");
        expect(paths).toContain("src/lib/config.ts");
    });

    test("hint contains comma-separated file paths", () => {
        const ctx: GeneratorContext = {
            cwd: tempDir,
            pm: "npm",
            tooling: "biome",
            framework: "nextjs",
        };
        const groups = resolveGroups(ctx);
        const deploy = groups.find((g) => g.label === "Deployment + CI/CD");

        if (!deploy) throw new Error("expected group");
        expect(deploy.hint).toBe("Dockerfile, .github/workflows/deploy.yml");
    });

    test("resolves group-specific next steps from metadata", () => {
        const ctx: GeneratorContext = {
            cwd: tempDir,
            pm: "npm",
            tooling: "biome",
            framework: "nextjs",
        };
        const groups = resolveGroups(ctx);
        const deploy = groups.find((g) => g.id === "deployment");
        const preCommit = groups.find((g) => g.id === "pre-commit");

        if (!deploy || !preCommit) throw new Error("expected groups");
        expect(deploy.nextSteps).toEqual([
            {
                text: 'Add output: "standalone" to your next.config (required for Docker)',
                stage: "before-review",
            },
            {
                text: "Update .github/workflows/deploy.yml with your settings",
            },
        ]);
        expect(preCommit.nextSteps).toEqual([
            { text: "Make a commit to test the pre-commit hook" },
        ]);
    });

    test("marks executable files from template metadata", () => {
        const ctx: GeneratorContext = {
            cwd: tempDir,
            pm: "npm",
            tooling: "biome",
            framework: "nextjs",
        };
        const groups = resolveGroups(ctx);
        const preCommit = groups.find((g) => g.id === "pre-commit");
        const hook = preCommit?.files.find(
            (file) => file.targetPath === ".husky/pre-commit",
        );

        expect(hook?.executable).toBe(true);
    });

    test("groups with all files filtered out are excluded", () => {
        const ctx: GeneratorContext = {
            cwd: tempDir,
            pm: "npm",
            tooling: "biome",
            framework: "nextjs",
        };
        const groups = resolveGroups(ctx);

        for (const group of groups) {
            expect(group.files.length > 0).toBe(true);
        }
    });
});

describe("getTemplatesDir", () => {
    test("returns path ending with templates", () => {
        const dir = getTemplatesDir();
        expect(dir.endsWith("templates")).toBe(true);
    });
});

describe("checkExistingFiles", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "files-test-"));
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    test("marks existing files correctly", () => {
        writeFileSync(join(tempDir, "Dockerfile"), "");
        const ctx: GeneratorContext = {
            cwd: tempDir,
            pm: "npm",
            tooling: "biome",
            framework: "nextjs",
        };
        const groups = resolveGroups(ctx);
        const deploy = groups.find((g) => g.label === "Deployment + CI/CD");
        if (!deploy) throw new Error("expected group");
        const status = checkExistingFiles(tempDir, deploy.files);

        const dockerfile = status.find(
            (s) => s.file.targetPath === "Dockerfile",
        );
        const deployYml = status.find(
            (s) => s.file.targetPath === ".github/workflows/deploy.yml",
        );

        expect(dockerfile?.exists).toBe(true);
        expect(deployYml?.exists).toBe(false);
    });

    test("handles nested paths", () => {
        mkdirSync(join(tempDir, ".github", "workflows"), { recursive: true });
        writeFileSync(join(tempDir, ".github", "workflows", "deploy.yml"), "");

        const ctx: GeneratorContext = {
            cwd: tempDir,
            pm: "npm",
            tooling: "biome",
            framework: "nextjs",
        };
        const groups = resolveGroups(ctx);
        const deploy = groups.find((g) => g.label === "Deployment + CI/CD");
        if (!deploy) throw new Error("expected group");
        const status = checkExistingFiles(tempDir, deploy.files);

        const workflow = status.find(
            (s) => s.file.targetPath === ".github/workflows/deploy.yml",
        );
        expect(workflow?.exists).toBe(true);
    });
});

describe("getRequiredPackages", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "deps-test-"));
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    test("returns husky and lint-staged from Pre-commit Hook group", () => {
        const ctx: GeneratorContext = {
            cwd: tempDir,
            pm: "npm",
            tooling: "biome",
            framework: "nextjs",
        };
        const groups = resolveGroups(ctx);
        const preCommit = groups.filter((g) => g.label === "Pre-commit Hook");

        const deps = getRequiredPackages(preCommit);
        expect(deps).toContain("husky");
        expect(deps).toContain("lint-staged");
    });

    test("returns empty array when Pre-commit Hook is not selected", () => {
        const ctx: GeneratorContext = {
            cwd: tempDir,
            pm: "npm",
            tooling: "biome",
            framework: "nextjs",
        };
        const groups = resolveGroups(ctx);
        const withoutPreCommit = groups.filter(
            (g) => g.label !== "Pre-commit Hook",
        );

        const deps = getRequiredPackages(withoutPreCommit);
        expect(deps).toEqual([]);
    });

    test("deduplicates packages", () => {
        const ctx: GeneratorContext = {
            cwd: tempDir,
            pm: "npm",
            tooling: "biome",
            framework: "nextjs",
        };
        const groups = resolveGroups(ctx);
        const deps = getRequiredPackages(groups);

        const uniqueDeps = [...new Set(deps)];
        expect(deps.length).toBe(uniqueDeps.length);
    });
});

describe("getPackageJsonMods", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "mods-test-"));
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    test("collects scripts from Deployment + CI/CD group (check, typecheck)", () => {
        const ctx: GeneratorContext = {
            cwd: tempDir,
            pm: "npm",
            tooling: "biome",
            framework: "nextjs",
        };
        const groups = resolveGroups(ctx);
        const deploy = groups.filter((g) => g.label === "Deployment + CI/CD");

        const mods = getPackageJsonMods(deploy);
        expect(mods.scripts.check).toBe("biome check .");
        expect(mods.scripts.typecheck).toBe("tsc --noEmit");
    });

    test("collects scripts and config from Pre-commit Hook group (prepare, lint-staged)", () => {
        const ctx: GeneratorContext = {
            cwd: tempDir,
            pm: "npm",
            tooling: "biome",
            framework: "nextjs",
        };
        const groups = resolveGroups(ctx);
        const preCommit = groups.filter((g) => g.label === "Pre-commit Hook");

        const mods = getPackageJsonMods(preCommit);
        expect(mods.scripts.prepare).toBe("husky");
        expect(mods.config["lint-staged"]).toEqual({
            "*": "biome check --write --no-errors-on-unmatched",
        });
    });

    test("uses biome check script when tooling is biome", () => {
        const ctx: GeneratorContext = {
            cwd: tempDir,
            pm: "npm",
            tooling: "biome",
            framework: "nextjs",
        };
        const groups = resolveGroups(ctx);
        const deploy = groups.filter((g) => g.label === "Deployment + CI/CD");

        const mods = getPackageJsonMods(deploy);
        expect(mods.scripts.check).toBe("biome check .");
    });

    test("uses eslint+prettier check script when tooling is eslint-prettier", () => {
        const ctx: GeneratorContext = {
            cwd: tempDir,
            pm: "npm",
            tooling: "eslint-prettier",
            framework: "nextjs",
        };
        const groups = resolveGroups(ctx);
        const deploy = groups.filter((g) => g.label === "Deployment + CI/CD");

        const mods = getPackageJsonMods(deploy);
        expect(mods.scripts.check).toBe("eslint . && prettier --check .");
    });

    test("returns empty mods for groups without packageJson (Editor Setup, API Client)", () => {
        const ctx: GeneratorContext = {
            cwd: tempDir,
            pm: "npm",
            tooling: "biome",
            framework: "nextjs",
        };
        const groups = resolveGroups(ctx);
        const noMods = groups.filter(
            (g) => g.label === "Editor Setup" || g.label === "API Client",
        );

        const mods = getPackageJsonMods(noMods);
        expect(mods.scripts).toEqual({});
        expect(mods.config).toEqual({});
    });
});

describe("buildSetupPlan", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "setup-plan-test-"));
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    test("collects files, deps, package.json mods, and next steps together", () => {
        writeFileSync(join(tempDir, "Dockerfile"), "");
        const ctx: GeneratorContext = {
            cwd: tempDir,
            pm: "npm",
            tooling: "biome",
            framework: "nextjs",
        };
        const groups = resolveGroups(ctx).filter(
            (group) => group.id === "deployment" || group.id === "pre-commit",
        );

        const plan = buildSetupPlan({ cwd: tempDir, groups });

        expect(plan.fileStatus.map(({ file }) => file.targetPath)).toEqual([
            "Dockerfile",
            ".github/workflows/deploy.yml",
            ".husky/pre-commit",
        ]);
        expect(plan.existingFiles.map(({ file }) => file.targetPath)).toEqual([
            "Dockerfile",
        ]);
        expect(plan.filesToApply.map((file) => file.targetPath)).toEqual([
            "Dockerfile",
            ".github/workflows/deploy.yml",
            ".husky/pre-commit",
        ]);
        expect(plan.requiredDeps).toEqual(["husky", "lint-staged"]);
        expect(plan.packageJsonMods.scripts).toEqual({
            check: "biome check .",
            typecheck: "tsc --noEmit",
            prepare: "husky",
        });
        expect(plan.packageJsonMods.config).toEqual({
            "lint-staged": {
                "*": "biome check --write --no-errors-on-unmatched",
            },
        });
        expect(plan.immediateNextSteps).toEqual([
            'Add output: "standalone" to your next.config (required for Docker)',
        ]);
        expect(plan.followUpNextSteps).toEqual([
            "Update .github/workflows/deploy.yml with your settings",
            "Make a commit to test the pre-commit hook",
        ]);
    });

    test("omits skipped files from filesToApply without changing the rest of the plan", () => {
        const ctx: GeneratorContext = {
            cwd: tempDir,
            pm: "npm",
            tooling: "biome",
            framework: "nextjs",
        };
        const groups = resolveGroups(ctx).filter(
            (group) => group.id === "deployment",
        );

        const plan = buildSetupPlan({
            cwd: tempDir,
            groups,
            filesToSkip: ["Dockerfile"],
        });

        expect(plan.filesToApply.map((file) => file.targetPath)).toEqual([
            ".github/workflows/deploy.yml",
        ]);
        expect(plan.requiredDeps).toEqual([]);
        expect(plan.immediateNextSteps).toEqual([
            'Add output: "standalone" to your next.config (required for Docker)',
        ]);
    });
});

describe("copyFile", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "copy-template-test-"));
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    test("writes bun.lockb into Next.js Dockerfile when bun.lockb exists", () => {
        writeFileSync(join(tempDir, "bun.lockb"), "");
        const ctx: GeneratorContext = {
            cwd: tempDir,
            pm: "bun",
            tooling: "biome",
            framework: "nextjs",
        };
        const groups = resolveGroups(ctx);
        const deploy = groups.find((g) => g.label === "Deployment + CI/CD");
        if (!deploy) throw new Error("expected group");
        const dockerfile = deploy.files.find(
            (f) => f.targetPath === "Dockerfile",
        );

        if (!dockerfile) throw new Error("expected file");
        copyFile(tempDir, dockerfile, ctx);

        const content = readFileSync(join(tempDir, "Dockerfile"), "utf-8");
        expect(content).toContain("bun.lockb");
    });

    test("writes husky hook with shim and executable bit", () => {
        const ctx: GeneratorContext = {
            cwd: tempDir,
            pm: "npm",
            tooling: "biome",
            framework: "nextjs",
        };
        const groups = resolveGroups(ctx);
        const preCommit = groups.find((g) => g.label === "Pre-commit Hook");
        if (!preCommit) throw new Error("expected group");
        const hook = preCommit.files.find(
            (f) => f.targetPath === ".husky/pre-commit",
        );

        if (!hook) throw new Error("expected file");
        copyFile(tempDir, hook, ctx);

        const hookPath = join(tempDir, ".husky", "pre-commit");
        const content = readFileSync(hookPath, "utf-8");
        expect(content.startsWith("#!/bin/sh")).toBe(true);
        expect(content).toContain('. "$(dirname "$0")/_/husky.sh"');
        expect(content).toContain("npx lint-staged");

        if (process.platform !== "win32") {
            const mode = statSync(hookPath).mode & 0o111;
            expect(mode).toBeGreaterThan(0);
        }
    });
});
