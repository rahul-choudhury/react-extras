import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const originalFetch = globalThis.fetch;
const globalAny = globalThis as unknown as {
    window?: { location?: { origin?: string } };
};
const originalWindow = globalAny.window;

afterEach(() => {
    globalThis.fetch = originalFetch;
    if (globalAny.window !== originalWindow) {
        if (originalWindow === undefined) {
            delete globalAny.window;
        } else {
            globalAny.window = originalWindow;
        }
    }
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
        const mockFetch = (async (request: Request) => {
            captured = request;
            return new Response("{}", {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;
        mockFetch.preconnect = () => {};
        globalThis.fetch = mockFetch;

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
        const mockFetch = (async (request: Request) => {
            captured = request;
            return new Response("{}", {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;
        mockFetch.preconnect = () => {};
        globalThis.fetch = mockFetch;

        const client = createApiClient({ baseUrl: "https://example.com" });
        await client.post("/hello", { ok: true });

        expect(captured).toBeDefined();
        expect(captured?.headers.get("Content-Type")).toBe("application/json");
        rmSync(tempDir, { recursive: true, force: true });
    });

    test("merges Headers instances for default and per-request headers", async () => {
        const tempDir = mkdtempSync(join(tmpdir(), "api-client-test-"));
        const { createApiClient } = await loadApiClient(tempDir);
        let captured: Request | undefined;
        const mockFetch = (async (request: Request) => {
            captured = request;
            return new Response("{}", {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;
        mockFetch.preconnect = () => {};
        globalThis.fetch = mockFetch;

        const client = createApiClient({
            baseUrl: "https://example.com",
            defaultHeaders: new Headers({ "X-Default": "1" }),
        });
        await client.get("/hello", {
            headers: new Headers({ "X-Request": "2" }),
        });

        expect(captured?.headers.get("X-Default")).toBe("1");
        expect(captured?.headers.get("X-Request")).toBe("2");
        rmSync(tempDir, { recursive: true, force: true });
    });

    test("uses window origin when baseUrl is empty", async () => {
        const tempDir = mkdtempSync(join(tmpdir(), "api-client-test-"));
        const { createApiClient } = await loadApiClient(tempDir);
        let captured: Request | undefined;
        const mockFetch = (async (request: Request) => {
            captured = request;
            return new Response("{}", {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;
        mockFetch.preconnect = () => {};
        globalThis.fetch = mockFetch;

        globalAny.window = { location: { origin: "https://example.com" } };
        const client = createApiClient({ baseUrl: "" });
        await client.get("/hello");

        expect(captured?.url).toBe("https://example.com/hello");
        rmSync(tempDir, { recursive: true, force: true });
    });

    test("returns null for empty JSON response bodies", async () => {
        const tempDir = mkdtempSync(join(tmpdir(), "api-client-test-"));
        const { createApiClient } = await loadApiClient(tempDir);
        const mockFetch = (async () => {
            return new Response(null, {
                status: 204,
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;
        mockFetch.preconnect = () => {};
        globalThis.fetch = mockFetch;

        const client = createApiClient({ baseUrl: "https://example.com" });
        const data = await client.get("/hello");

        expect(data).toBeNull();
        rmSync(tempDir, { recursive: true, force: true });
    });
});
