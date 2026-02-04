import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

function loadApiClient(tempDir: string) {
    const apiClientSource = readFileSync(
        join(process.cwd(), "templates/lib/api-client.ts"),
        "utf-8",
    );
    writeFileSync(join(tempDir, "api-client.ts"), apiClientSource);
    writeFileSync(
        join(tempDir, "config.ts"),
        `export const apiBaseUrl = "https://example.com";\n`,
    );
    return import(pathToFileURL(join(tempDir, "api-client.ts")).toString());
}

describe("createApiClient", () => {
    test("does not set Content-Type for GET without body", async () => {
        const tempDir = mkdtempSync(join(tmpdir(), "api-client-test-"));
        const { createApiClient } = await loadApiClient(tempDir);
        let captured: Request | undefined;
        globalThis.fetch = async (request: Request) => {
            captured = request;
            return new Response("{}", {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        };

        const client = createApiClient({ baseUrl: "https://example.com" });
        await client.get("/hello");

        expect(captured).toBeDefined();
        expect(captured?.headers.has("Content-Type")).toBe(false);
        rmSync(tempDir, { recursive: true, force: true });
    });

    test("sets Content-Type for JSON body", async () => {
        const tempDir = mkdtempSync(join(tmpdir(), "api-client-test-"));
        const { createApiClient } = await loadApiClient(tempDir);
        let captured: Request | undefined;
        globalThis.fetch = async (request: Request) => {
            captured = request;
            return new Response("{}", {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        };

        const client = createApiClient({ baseUrl: "https://example.com" });
        await client.post("/hello", { ok: true });

        expect(captured).toBeDefined();
        expect(captured?.headers.get("Content-Type")).toBe(
            "application/json",
        );
        rmSync(tempDir, { recursive: true, force: true });
    });
});
