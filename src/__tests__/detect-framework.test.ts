import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    detectFramework,
    getFrameworkLabel,
    getNextConfigPath,
} from "../detect-framework.js";

describe("detectFramework", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "detect-framework-test-"));
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    test("detects Next.js from next.config.ts", () => {
        writeFileSync(join(tempDir, "next.config.ts"), "export default {}");
        const result = detectFramework(tempDir);
        expect(result.framework).toBe("nextjs");
        expect(result.inferred).toBe(false);
    });

    test("detects Next.js from next.config.js", () => {
        writeFileSync(join(tempDir, "next.config.js"), "module.exports = {}");
        const result = detectFramework(tempDir);
        expect(result.framework).toBe("nextjs");
        expect(result.inferred).toBe(false);
    });

    test("detects Next.js from next.config.mjs", () => {
        writeFileSync(join(tempDir, "next.config.mjs"), "export default {}");
        const result = detectFramework(tempDir);
        expect(result.framework).toBe("nextjs");
        expect(result.inferred).toBe(false);
    });

    test("detects Next.js from next.config.cjs", () => {
        writeFileSync(join(tempDir, "next.config.cjs"), "module.exports = {}");
        const result = detectFramework(tempDir);
        expect(result.framework).toBe("nextjs");
        expect(result.inferred).toBe(false);
    });

    test("detects Next.js from package.json dependency", () => {
        writeFileSync(
            join(tempDir, "package.json"),
            JSON.stringify({
                dependencies: { next: "^14.0.0" },
            }),
        );
        const result = detectFramework(tempDir);
        expect(result.framework).toBe("nextjs");
        expect(result.inferred).toBe(false);
    });

    test("detects Next.js from package.json devDependency", () => {
        writeFileSync(
            join(tempDir, "package.json"),
            JSON.stringify({
                devDependencies: { next: "^14.0.0" },
            }),
        );
        const result = detectFramework(tempDir);
        expect(result.framework).toBe("nextjs");
        expect(result.inferred).toBe(false);
    });

    test("detects Vite + TanStack Router from package.json", () => {
        writeFileSync(
            join(tempDir, "package.json"),
            JSON.stringify({
                dependencies: {
                    vite: "^5.0.0",
                    "@tanstack/react-router": "^1.0.0",
                },
            }),
        );
        const result = detectFramework(tempDir);
        expect(result.framework).toBe("vite-tanstack-router");
        expect(result.inferred).toBe(false);
    });

    test("defaults to vite-tanstack-router with inferred=true when unknown", () => {
        writeFileSync(
            join(tempDir, "package.json"),
            JSON.stringify({
                dependencies: { react: "^18.0.0" },
            }),
        );
        const result = detectFramework(tempDir);
        expect(result.framework).toBe("vite-tanstack-router");
        expect(result.inferred).toBe(true);
    });

    test("defaults with inferred=true when no package.json", () => {
        const result = detectFramework(tempDir);
        expect(result.framework).toBe("vite-tanstack-router");
        expect(result.inferred).toBe(true);
    });

    test("prefers config file over package.json", () => {
        writeFileSync(join(tempDir, "next.config.ts"), "export default {}");
        writeFileSync(
            join(tempDir, "package.json"),
            JSON.stringify({
                dependencies: { vite: "^5.0.0" },
            }),
        );
        const result = detectFramework(tempDir);
        expect(result.framework).toBe("nextjs");
    });
});

describe("getFrameworkLabel", () => {
    test("returns correct label for nextjs", () => {
        expect(getFrameworkLabel("nextjs")).toBe("Next.js");
    });

    test("returns correct label for vite-tanstack-router", () => {
        expect(getFrameworkLabel("vite-tanstack-router")).toBe(
            "Vite + TanStack Router",
        );
    });
});

describe("getNextConfigPath", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "next-config-path-test-"));
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    test("returns path for next.config.ts", () => {
        writeFileSync(join(tempDir, "next.config.ts"), "");
        expect(getNextConfigPath(tempDir)).toBe(
            join(tempDir, "next.config.ts"),
        );
    });

    test("returns path for next.config.js", () => {
        writeFileSync(join(tempDir, "next.config.js"), "");
        expect(getNextConfigPath(tempDir)).toBe(
            join(tempDir, "next.config.js"),
        );
    });

    test("returns path for next.config.cjs", () => {
        writeFileSync(join(tempDir, "next.config.cjs"), "");
        expect(getNextConfigPath(tempDir)).toBe(
            join(tempDir, "next.config.cjs"),
        );
    });

    test("returns null when no config exists", () => {
        expect(getNextConfigPath(tempDir)).toBeNull();
    });
});
