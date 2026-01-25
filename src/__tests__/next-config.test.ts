import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureStandaloneOutput } from "../next-config.js";

describe("ensureStandaloneOutput", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "next-config-test-"));
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    test("creates next.config.ts when no config exists", () => {
        const result = ensureStandaloneOutput(tempDir);

        expect(result.status).toBe("created");
        expect(result.path).toBe(join(tempDir, "next.config.ts"));

        const content = readFileSync(result.path, "utf-8");
        expect(content).toContain('output: "standalone"');
    });

    test("returns already-configured when standalone exists with double quotes", () => {
        writeFileSync(
            join(tempDir, "next.config.ts"),
            `export default { output: "standalone" }`,
        );

        const result = ensureStandaloneOutput(tempDir);
        expect(result.status).toBe("already-configured");
    });

    test("returns already-configured when standalone exists with single quotes", () => {
        writeFileSync(
            join(tempDir, "next.config.ts"),
            `export default { output: 'standalone' }`,
        );

        const result = ensureStandaloneOutput(tempDir);
        expect(result.status).toBe("already-configured");
    });

    test("returns manual-required when different output is set", () => {
        writeFileSync(
            join(tempDir, "next.config.ts"),
            `export default { output: "export" }`,
        );

        const result = ensureStandaloneOutput(tempDir);
        expect(result.status).toBe("manual-required");
        expect(result.message).toContain("different output setting");
    });

    test("updates TypeScript config with NextConfig type", () => {
        writeFileSync(
            join(tempDir, "next.config.ts"),
            `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    reactStrictMode: true,
};

export default nextConfig;`,
        );

        const result = ensureStandaloneOutput(tempDir);
        expect(result.status).toBe("updated");

        const content = readFileSync(result.path, "utf-8");
        expect(content).toContain('output: "standalone"');
        expect(content).toContain("reactStrictMode: true");
    });

    test("updates CommonJS config with module.exports", () => {
        writeFileSync(
            join(tempDir, "next.config.js"),
            `module.exports = {
    reactStrictMode: true,
};`,
        );

        const result = ensureStandaloneOutput(tempDir);
        expect(result.status).toBe("updated");

        const content = readFileSync(result.path, "utf-8");
        expect(content).toContain('output: "standalone"');
    });

    test("updates ESM config with export default", () => {
        writeFileSync(
            join(tempDir, "next.config.mjs"),
            `export default {
    reactStrictMode: true,
};`,
        );

        const result = ensureStandaloneOutput(tempDir);
        expect(result.status).toBe("updated");

        const content = readFileSync(result.path, "utf-8");
        expect(content).toContain('output: "standalone"');
    });

    test("returns manual-required for wrapped configs", () => {
        writeFileSync(
            join(tempDir, "next.config.js"),
            `const withPWA = require("next-pwa");

module.exports = withPWA({
    reactStrictMode: true,
});`,
        );

        const result = ensureStandaloneOutput(tempDir);
        // This pattern is not matched by current regex
        expect(result.status).toBe("manual-required");
    });

    test("returns manual-required for function exports", () => {
        writeFileSync(
            join(tempDir, "next.config.ts"),
            `export default () => ({
    reactStrictMode: true,
});`,
        );

        const result = ensureStandaloneOutput(tempDir);
        expect(result.status).toBe("manual-required");
    });
});
