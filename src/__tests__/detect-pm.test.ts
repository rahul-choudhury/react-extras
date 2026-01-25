import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectPackageManager } from "../detect-pm.js";

describe("detectPackageManager", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "detect-pm-test-"));
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    test("detects bun from bun.lock", () => {
        writeFileSync(join(tempDir, "bun.lock"), "");
        const result = detectPackageManager(tempDir);
        expect(result.pm).toBe("bun");
        expect(result.inferred).toBe(false);
    });

    test("detects bun from bun.lockb", () => {
        writeFileSync(join(tempDir, "bun.lockb"), "");
        const result = detectPackageManager(tempDir);
        expect(result.pm).toBe("bun");
        expect(result.inferred).toBe(false);
    });

    test("detects pnpm from pnpm-lock.yaml", () => {
        writeFileSync(join(tempDir, "pnpm-lock.yaml"), "");
        const result = detectPackageManager(tempDir);
        expect(result.pm).toBe("pnpm");
        expect(result.inferred).toBe(false);
    });

    test("detects yarn from yarn.lock", () => {
        writeFileSync(join(tempDir, "yarn.lock"), "");
        const result = detectPackageManager(tempDir);
        expect(result.pm).toBe("yarn");
        expect(result.inferred).toBe(false);
    });

    test("detects npm from package-lock.json", () => {
        writeFileSync(join(tempDir, "package-lock.json"), "{}");
        const result = detectPackageManager(tempDir);
        expect(result.pm).toBe("npm");
        expect(result.inferred).toBe(false);
    });

    test("defaults to npm with inferred=true when no lock file", () => {
        const result = detectPackageManager(tempDir);
        expect(result.pm).toBe("npm");
        expect(result.inferred).toBe(true);
    });

    test("prefers bun over other lock files when multiple exist", () => {
        writeFileSync(join(tempDir, "bun.lock"), "");
        writeFileSync(join(tempDir, "package-lock.json"), "{}");
        const result = detectPackageManager(tempDir);
        expect(result.pm).toBe("bun");
    });
});
