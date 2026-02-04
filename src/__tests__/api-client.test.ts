import { afterEach, describe, expect, test } from "bun:test";
import { createApiClient } from "../../templates/lib/api-client.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe("createApiClient", () => {
    test("does not set Content-Type for GET without body", async () => {
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
    });

    test("sets Content-Type for JSON body", async () => {
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
    });
});
