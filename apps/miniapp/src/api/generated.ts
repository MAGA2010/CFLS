// Generated from packages/contracts/openapi.yaml by tools/generate-contract.mjs.

// Edit the upstream contract and regenerate this public API projection.

export interface paths {
    "/v1/public/contents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listPublicContents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/public/contents/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getPublicContent"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/public/test-inquiries": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Only available in local/staging when explicitly enabled. Production always returns 404. */
        post: operations["createTestInquiry"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** @enum {string} */
        ContentType: "school" | "academics" | "outcomes" | "campus" | "student_union" | "news" | "admissions" | "contact";
        ErrorResponse: {
            error: {
                /** @enum {string} */
                code: "VALIDATION_FAILED" | "UNAUTHENTICATED" | "AUTH_FAILED" | "FORBIDDEN" | "SELF_REVIEW_FORBIDDEN" | "CSRF_INVALID" | "NOT_FOUND" | "VERSION_CONFLICT" | "INVALID_TRANSITION" | "IDEMPOTENCY_CONFLICT" | "RATE_LIMITED" | "INTERNAL_ERROR";
                details?: unknown;
                message: string;
            };
            /** Format: uuid */
            requestId: string;
        };
        InquiryCreatedResponse: {
            data?: {
                /** Format: date-time */
                createdAt: string;
                /** Format: uuid */
                id: string;
            };
            /** Format: uuid */
            requestId?: string;
        };
        PaginationMeta: {
            page: number;
            pageSize: number;
            total: number;
        };
        PublicContent: {
            body: string;
            category: string;
            /** Format: uuid */
            id: string;
            isDemo: boolean;
            /** Format: date-time */
            publishedAt: string;
            summary: string | null;
            title: string;
            type: components["schemas"]["ContentType"];
        };
        TestInquiryCreate: {
            /** @constant */
            isTest: true;
            /** @enum {string} */
            kind: "consultation" | "visit";
            message?: string;
            testContact: string;
            testName: string;
        };
    };
    responses: {
        /** @description Version, transition or idempotency conflict */
        Conflict: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description Resource not found or hidden */
        NotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description Rate limit exceeded */
        RateLimited: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description Validation failed */
        ValidationError: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
    };
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    listPublicContents: {
        parameters: {
            query?: {
                category?: string;
                page?: number;
                pageSize?: number;
                type?: components["schemas"]["ContentType"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Published content only */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: components["schemas"]["PublicContent"][];
                        meta: components["schemas"]["PaginationMeta"];
                        /** Format: uuid */
                        requestId: string;
                    };
                };
            };
            400: components["responses"]["ValidationError"];
        };
    };
    getPublicContent: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Published content */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: components["schemas"]["PublicContent"];
                        /** Format: uuid */
                        requestId: string;
                    };
                };
            };
            404: components["responses"]["NotFound"];
        };
    };
    createTestInquiry: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TestInquiryCreate"];
            };
        };
        responses: {
            /** @description Idempotent replay */
            200: {
                headers: {
                    "Idempotent-Replay"?: "true";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InquiryCreatedResponse"];
                };
            };
            /** @description First successful submission */
            201: {
                headers: {
                    "Idempotent-Replay"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InquiryCreatedResponse"];
                };
            };
            400: components["responses"]["ValidationError"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            429: components["responses"]["RateLimited"];
        };
    };
}

export const apiPaths = {
  "listPublicContents": "/v1/public/contents",
  "getPublicContent": "/v1/public/contents/{id}",
  "createTestInquiry": "/v1/public/test-inquiries"
} as const

export const apiHeaders = {
  "idempotencyKey": "Idempotency-Key",
  "idempotentReplay": "Idempotent-Replay"
} as const

export const contentTypes = [
  "school",
  "academics",
  "outcomes",
  "campus",
  "student_union",
  "news",
  "admissions",
  "contact"
] as const

export const errorCodes = [
  "VALIDATION_FAILED",
  "UNAUTHENTICATED",
  "AUTH_FAILED",
  "FORBIDDEN",
  "SELF_REVIEW_FORBIDDEN",
  "CSRF_INVALID",
  "NOT_FOUND",
  "VERSION_CONFLICT",
  "INVALID_TRANSITION",
  "IDEMPOTENCY_CONFLICT",
  "RATE_LIMITED",
  "INTERNAL_ERROR"
] as const

export const inquiryKinds = [
  "consultation",
  "visit"
] as const

export const inquiryLimits = {
  "testName": 40,
  "testContact": 100,
  "message": 500
} as const
