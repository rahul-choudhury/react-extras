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
    const url = new URL(path, baseUrl);

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

    if (contentType?.includes("application/json")) {
        return response.json();
    }

    if (contentType?.includes("text/")) {
        return response.text();
    }

    return response.blob();
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

        const resolvedHeaders: HeadersInit = {
            ...defaultHeaders,
            ...headers,
        };
        if (!isFormData && body !== undefined) {
            if (!new Headers(resolvedHeaders).has("Content-Type")) {
                resolvedHeaders["Content-Type"] = "application/json";
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
    baseUrl: typeof window !== "undefined" ? window.location.origin : "",
});
