import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    checkExistingFiles,
    getTemplateFiles,
    getTemplatesDir,
} from "../files.js";

describe("getTemplateFiles", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "files-test-"));
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    test("returns template files for nextjs framework", () => {
        const files = getTemplateFiles(tempDir, "nextjs");
        const labels = files.map((f) => f.label);

        expect(labels).toContain("GitHub Actions workflow");
        expect(labels).toContain("Dockerfile");
        expect(labels).toContain("EditorConfig");
        expect(labels).toContain("API client");
        expect(labels).not.toContain("Nginx config");
    });

    test("includes nginx config for vite-tanstack-router framework", () => {
        const files = getTemplateFiles(tempDir, "vite-tanstack-router");
        const labels = files.map((f) => f.label);

        expect(labels).toContain("Nginx config");
    });

    test("uses lib/api-client.ts when no src directory exists", () => {
        const files = getTemplateFiles(tempDir, "nextjs");
        const apiClient = files.find((f) => f.label === "API client");

        expect(apiClient?.targetPath).toBe("lib/api-client.ts");
    });

    test("uses src/lib/api-client.ts when src directory exists", () => {
        mkdirSync(join(tempDir, "src"));
        const files = getTemplateFiles(tempDir, "nextjs");
        const apiClient = files.find((f) => f.label === "API client");

        expect(apiClient?.targetPath).toBe("src/lib/api-client.ts");
    });

    test("static templates have correct templatePath", () => {
        const files = getTemplateFiles(tempDir, "nextjs");
        const editorconfig = files.find((f) => f.label === "EditorConfig");

        expect(editorconfig?.templatePath).toBe("editorconfig");
    });

    test("dynamic templates use targetPath as templatePath", () => {
        const files = getTemplateFiles(tempDir, "nextjs");
        const dockerfile = files.find((f) => f.label === "Dockerfile");

        expect(dockerfile?.templatePath).toBe("Dockerfile");
        expect(dockerfile?.targetPath).toBe("Dockerfile");
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
        const files = getTemplateFiles(tempDir, "nextjs");
        const status = checkExistingFiles(tempDir, files);

        const dockerfile = status.find((s) => s.file.label === "Dockerfile");
        const editorconfig = status.find(
            (s) => s.file.label === "EditorConfig",
        );

        expect(dockerfile?.exists).toBe(true);
        expect(editorconfig?.exists).toBe(false);
    });

    test("handles nested paths", () => {
        mkdirSync(join(tempDir, ".github", "workflows"), { recursive: true });
        writeFileSync(join(tempDir, ".github", "workflows", "deploy.yml"), "");

        const files = getTemplateFiles(tempDir, "nextjs");
        const status = checkExistingFiles(tempDir, files);

        const workflow = status.find(
            (s) => s.file.label === "GitHub Actions workflow",
        );
        expect(workflow?.exists).toBe(true);
    });
});
