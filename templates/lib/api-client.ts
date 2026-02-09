import { apiBaseUrl } from "./config";

type RequestOptions = Omit<RequestInit, "body"> & {
    params?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
};

type ApiClientConfig = {
    baseUrl: string;
    defaultHeaders?: HeadersInit;
    onRequest?: (request: Request) => Request | Promise<Request>;
    onResponse?: (response: Response) => Response | Promise<Response>;
    onError?: (error: ApiError) => void | Promise<void>;
};

export class ApiError extends Error {
    constructor(
        public status: number,
        public statusText: string,
        public data: unknown,
    ) {
        super(`${status} ${statusText}`);
        this.name = "ApiError";
    }
}

function buildUrl(
    baseUrl: string,
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
): string {
    const trimmedBaseUrl = baseUrl.trim();
    let url: URL;

    if (trimmedBaseUrl) {
        url = new URL(path, trimmedBaseUrl);
    } else if (/^https?:\/\//i.test(path)) {
        url = new URL(path);
    } else if (typeof window !== "undefined" && window.location?.origin) {
        url = new URL(path, window.location.origin);
    } else {
        throw new Error(
            "createApiClient: baseUrl is required for relative paths",
        );
    }

    if (params) {
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined) {
                url.searchParams.set(key, String(value));
            }
        }
    }

    return url.toString();
}

async function parseResponse(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type");

    if (response.status === 204 || response.status === 205 || response.status === 304) {
        return null;
    }

    if (contentType?.includes("application/json")) {
        const text = await response.text();
        if (!text) {
            return null;
        }
        return JSON.parse(text);
    }

    if (contentType?.includes("text/")) {
        return response.text();
    }

    return response.blob();
}

function mergeHeaders(
    defaultHeaders: HeadersInit,
    headers?: HeadersInit,
): Headers {
    const resolved = new Headers(defaultHeaders);
    if (headers) {
        const extra = new Headers(headers);
        extra.forEach((value, key) => {
            resolved.set(key, value);
        });
    }
    return resolved;
}

export function createApiClient(config: ApiClientConfig) {
    const {
        baseUrl,
        defaultHeaders = {},
        onRequest,
        onResponse,
        onError,
    } = config;

    async function request<T>(
        path: string,
        options: RequestOptions = {},
    ): Promise<T> {
        const { params, body, headers, ...init } = options;

        const url = buildUrl(baseUrl, path, params);

        const isFormData = body instanceof FormData;

        const resolvedHeaders = mergeHeaders(defaultHeaders, headers);
        if (!isFormData && body !== undefined) {
            if (!resolvedHeaders.has("Content-Type")) {
                resolvedHeaders.set("Content-Type", "application/json");
            }
        }

        let request = new Request(url, {
            ...init,
            headers: resolvedHeaders,
            body: isFormData
                ? body
                : body !== undefined
                  ? JSON.stringify(body)
                  : undefined,
        });

        if (onRequest) {
            request = await onRequest(request);
        }

        let response = await fetch(request);

        if (onResponse) {
            response = await onResponse(response);
        }

        const data = await parseResponse(response);

        if (!response.ok) {
            const error = new ApiError(
                response.status,
                response.statusText,
                data,
            );
            if (onError) {
                await onError(error);
            }
            throw error;
        }

        return data as T;
    }

    return {
        get<T>(path: string, options?: Omit<RequestOptions, "body">) {
            return request<T>(path, { ...options, method: "GET" });
        },

        post<T>(path: string, body?: unknown, options?: RequestOptions) {
            return request<T>(path, { ...options, method: "POST", body });
        },

        put<T>(path: string, body?: unknown, options?: RequestOptions) {
            return request<T>(path, { ...options, method: "PUT", body });
        },

        patch<T>(path: string, body?: unknown, options?: RequestOptions) {
            return request<T>(path, { ...options, method: "PATCH", body });
        },

        delete<T>(path: string, options?: RequestOptions) {
            return request<T>(path, { ...options, method: "DELETE" });
        },

        request,
    };
}

export const api = createApiClient({
    baseUrl: apiBaseUrl,
});
