import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { updatePackageJson } from "../package-json.js";

describe("updatePackageJson", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "package-json-test-"));
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    test("adds prepare script and lint-staged config", () => {
        writeFileSync(
            join(tempDir, "package.json"),
            JSON.stringify({
                name: "test",
                scripts: {},
            }),
        );

        const result = updatePackageJson({
            cwd: tempDir,
            lintStagedConfig: { "*": "biome check" },
            framework: "vite-tanstack-router",
            tooling: "biome",
        });

        expect(result.addedPrepare).toBe(true);
        expect(result.addedLintStaged).toBe(true);
        expect(result.addedCheck).toBe(false);

        const pkg = JSON.parse(
            readFileSync(join(tempDir, "package.json"), "utf-8"),
        );
        expect(pkg.scripts.prepare).toBe("husky");
        expect(pkg["lint-staged"]).toEqual({ "*": "biome check" });
    });

    test("does not overwrite existing prepare script", () => {
        writeFileSync(
            join(tempDir, "package.json"),
            JSON.stringify({
                name: "test",
                scripts: {
                    prepare: "custom-script",
                },
            }),
        );

        const result = updatePackageJson({
            cwd: tempDir,
            lintStagedConfig: { "*": "biome check" },
            framework: "vite-tanstack-router",
            tooling: "biome",
        });

        expect(result.addedPrepare).toBe(false);

        const pkg = JSON.parse(
            readFileSync(join(tempDir, "package.json"), "utf-8"),
        );
        expect(pkg.scripts.prepare).toBe("custom-script");
    });

    test("does not overwrite existing lint-staged config", () => {
        writeFileSync(
            join(tempDir, "package.json"),
            JSON.stringify({
                name: "test",
                scripts: {},
                "lint-staged": { "*.js": "custom-lint" },
            }),
        );

        const result = updatePackageJson({
            cwd: tempDir,
            lintStagedConfig: { "*": "biome check" },
            framework: "vite-tanstack-router",
            tooling: "biome",
        });

        expect(result.addedLintStaged).toBe(false);

        const pkg = JSON.parse(
            readFileSync(join(tempDir, "package.json"), "utf-8"),
        );
        expect(pkg["lint-staged"]).toEqual({ "*.js": "custom-lint" });
    });

    test("creates scripts object if missing", () => {
        writeFileSync(
            join(tempDir, "package.json"),
            JSON.stringify({
                name: "test",
            }),
        );

        updatePackageJson({
            cwd: tempDir,
            lintStagedConfig: { "*": "biome check" },
            framework: "vite-tanstack-router",
            tooling: "biome",
        });

        const pkg = JSON.parse(
            readFileSync(join(tempDir, "package.json"), "utf-8"),
        );
        expect(pkg.scripts.prepare).toBe("husky");
    });

    test("preserves existing package.json fields", () => {
        writeFileSync(
            join(tempDir, "package.json"),
            JSON.stringify({
                name: "test",
                version: "1.0.0",
                dependencies: { react: "^18.0.0" },
                scripts: { build: "vite build" },
            }),
        );

        updatePackageJson({
            cwd: tempDir,
            lintStagedConfig: { "*": "biome check" },
            framework: "vite-tanstack-router",
            tooling: "biome",
        });

        const pkg = JSON.parse(
            readFileSync(join(tempDir, "package.json"), "utf-8"),
        );
        expect(pkg.name).toBe("test");
        expect(pkg.version).toBe("1.0.0");
        expect(pkg.dependencies.react).toBe("^18.0.0");
        expect(pkg.scripts.build).toBe("vite build");
    });

    test("adds check script for Next.js with biome", () => {
        writeFileSync(
            join(tempDir, "package.json"),
            JSON.stringify({
                name: "test",
                scripts: {},
            }),
        );

        const result = updatePackageJson({
            cwd: tempDir,
            lintStagedConfig: { "*": "biome check" },
            framework: "nextjs",
            tooling: "biome",
        });

        expect(result.addedCheck).toBe(true);

        const pkg = JSON.parse(
            readFileSync(join(tempDir, "package.json"), "utf-8"),
        );
        expect(pkg.scripts.check).toBe("biome check .");
    });

    test("adds check script for Next.js with eslint-prettier", () => {
        writeFileSync(
            join(tempDir, "package.json"),
            JSON.stringify({
                name: "test",
                scripts: {},
            }),
        );

        const result = updatePackageJson({
            cwd: tempDir,
            lintStagedConfig: { "*.js": "eslint" },
            framework: "nextjs",
            tooling: "eslint-prettier",
        });

        expect(result.addedCheck).toBe(true);

        const pkg = JSON.parse(
            readFileSync(join(tempDir, "package.json"), "utf-8"),
        );
        expect(pkg.scripts.check).toBe("eslint . && prettier --check .");
    });

    test("does not add check script for non-Next.js frameworks", () => {
        writeFileSync(
            join(tempDir, "package.json"),
            JSON.stringify({
                name: "test",
                scripts: {},
            }),
        );

        const result = updatePackageJson({
            cwd: tempDir,
            lintStagedConfig: { "*": "biome check" },
            framework: "vite-tanstack-router",
            tooling: "biome",
        });

        expect(result.addedCheck).toBe(false);

        const pkg = JSON.parse(
            readFileSync(join(tempDir, "package.json"), "utf-8"),
        );
        expect(pkg.scripts.check).toBeUndefined();
    });

    test("does not overwrite existing check script", () => {
        writeFileSync(
            join(tempDir, "package.json"),
            JSON.stringify({
                name: "test",
                scripts: {
                    check: "custom-check",
                },
            }),
        );

        const result = updatePackageJson({
            cwd: tempDir,
            lintStagedConfig: { "*": "biome check" },
            framework: "nextjs",
            tooling: "biome",
        });

        expect(result.addedCheck).toBe(false);

        const pkg = JSON.parse(
            readFileSync(join(tempDir, "package.json"), "utf-8"),
        );
        expect(pkg.scripts.check).toBe("custom-check");
    });
});
