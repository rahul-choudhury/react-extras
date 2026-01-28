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

    test("adds scripts and config from mods", () => {
        writeFileSync(
            join(tempDir, "package.json"),
            JSON.stringify({
                name: "test",
                scripts: {},
            }),
        );

        const result = updatePackageJson({
            cwd: tempDir,
            mods: {
                scripts: {
                    prepare: "husky",
                    check: "biome check .",
                },
                config: {
                    "lint-staged": { "*": "biome check" },
                },
            },
        });

        expect(result.added).toContain("prepare script");
        expect(result.added).toContain("check script");
        expect(result.added).toContain("lint-staged config");

        const pkg = JSON.parse(
            readFileSync(join(tempDir, "package.json"), "utf-8"),
        );
        expect(pkg.scripts.prepare).toBe("husky");
        expect(pkg.scripts.check).toBe("biome check .");
        expect(pkg["lint-staged"]).toEqual({ "*": "biome check" });
    });

    test("does not overwrite existing scripts", () => {
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
            mods: {
                scripts: { prepare: "husky" },
                config: {},
            },
        });

        expect(result.added).not.toContain("prepare script");

        const pkg = JSON.parse(
            readFileSync(join(tempDir, "package.json"), "utf-8"),
        );
        expect(pkg.scripts.prepare).toBe("custom-script");
    });

    test("does not overwrite existing config", () => {
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
            mods: {
                scripts: {},
                config: { "lint-staged": { "*": "biome check" } },
            },
        });

        expect(result.added).not.toContain("lint-staged config");

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
            mods: {
                scripts: { prepare: "husky" },
                config: {},
            },
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
            mods: {
                scripts: { prepare: "husky" },
                config: {},
            },
        });

        const pkg = JSON.parse(
            readFileSync(join(tempDir, "package.json"), "utf-8"),
        );
        expect(pkg.name).toBe("test");
        expect(pkg.version).toBe("1.0.0");
        expect(pkg.dependencies.react).toBe("^18.0.0");
        expect(pkg.scripts.build).toBe("vite build");
    });

    test("returns empty array when nothing added", () => {
        writeFileSync(
            join(tempDir, "package.json"),
            JSON.stringify({
                name: "test",
                scripts: { check: "existing" },
                "lint-staged": { "*": "existing" },
            }),
        );

        const result = updatePackageJson({
            cwd: tempDir,
            mods: {
                scripts: { check: "biome check ." },
                config: { "lint-staged": { "*": "biome check" } },
            },
        });

        expect(result.added).toEqual([]);
    });
});
