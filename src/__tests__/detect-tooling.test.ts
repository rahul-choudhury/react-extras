import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    detectTooling,
    getLintStagedConfig,
    getToolingLabel,
} from "../detect-tooling.js";

describe("detectTooling", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "detect-tooling-test-"));
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    test("detects Biome from biome.json", () => {
        writeFileSync(join(tempDir, "biome.json"), "{}");
        const result = detectTooling(tempDir);
        expect(result.tooling).toBe("biome");
        expect(result.inferred).toBe(false);
    });

    test("detects Biome from biome.jsonc", () => {
        writeFileSync(join(tempDir, "biome.jsonc"), "{}");
        const result = detectTooling(tempDir);
        expect(result.tooling).toBe("biome");
        expect(result.inferred).toBe(false);
    });

    test("detects Biome from package.json dependency", () => {
        writeFileSync(
            join(tempDir, "package.json"),
            JSON.stringify({
                devDependencies: { "@biomejs/biome": "^1.0.0" },
            }),
        );
        const result = detectTooling(tempDir);
        expect(result.tooling).toBe("biome");
        expect(result.inferred).toBe(false);
    });

    test("detects ESLint from package.json", () => {
        writeFileSync(
            join(tempDir, "package.json"),
            JSON.stringify({
                devDependencies: { eslint: "^8.0.0" },
            }),
        );
        const result = detectTooling(tempDir);
        expect(result.tooling).toBe("eslint-prettier");
        expect(result.inferred).toBe(false);
    });

    test("detects Prettier from package.json", () => {
        writeFileSync(
            join(tempDir, "package.json"),
            JSON.stringify({
                devDependencies: { prettier: "^3.0.0" },
            }),
        );
        const result = detectTooling(tempDir);
        expect(result.tooling).toBe("eslint-prettier");
        expect(result.inferred).toBe(false);
    });

    test("defaults to eslint-prettier with inferred=true when unknown", () => {
        writeFileSync(
            join(tempDir, "package.json"),
            JSON.stringify({
                dependencies: { react: "^18.0.0" },
            }),
        );
        const result = detectTooling(tempDir);
        expect(result.tooling).toBe("eslint-prettier");
        expect(result.inferred).toBe(true);
    });

    test("defaults with inferred=true when no package.json", () => {
        const result = detectTooling(tempDir);
        expect(result.tooling).toBe("eslint-prettier");
        expect(result.inferred).toBe(true);
    });

    test("prefers biome.json over package.json", () => {
        writeFileSync(join(tempDir, "biome.json"), "{}");
        writeFileSync(
            join(tempDir, "package.json"),
            JSON.stringify({
                devDependencies: { eslint: "^8.0.0" },
            }),
        );
        const result = detectTooling(tempDir);
        expect(result.tooling).toBe("biome");
    });
});

describe("getLintStagedConfig", () => {
    test("returns biome config for biome tooling", () => {
        const config = getLintStagedConfig("biome");
        expect(config).toEqual({
            "*": "biome check --write --no-errors-on-unmatched",
        });
    });

    test("returns eslint+prettier config for eslint-prettier tooling", () => {
        const config = getLintStagedConfig("eslint-prettier");
        expect(config).toEqual({
            "*.{js,jsx,ts,tsx,css,md}": "prettier --write",
            "*.{js,jsx,ts,tsx}": "eslint",
        });
    });
});

describe("getToolingLabel", () => {
    test("returns correct label for biome", () => {
        expect(getToolingLabel("biome")).toBe("Biome");
    });

    test("returns correct label for eslint-prettier", () => {
        expect(getToolingLabel("eslint-prettier")).toBe("ESLint + Prettier");
    });
});
