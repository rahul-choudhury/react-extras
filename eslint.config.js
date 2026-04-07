import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

const nodeGlobals = {
    AbortController: "readonly",
    Blob: "readonly",
    Buffer: "readonly",
    Headers: "readonly",
    Request: "readonly",
    Response: "readonly",
    URL: "readonly",
    console: "readonly",
    fetch: "readonly",
    process: "readonly",
};

const bunGlobals = {
    Bun: "readonly",
};

export default defineConfig(
    {
        ignores: ["dist/**", "node_modules/**"],
    },
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: nodeGlobals,
        },
    },
    js.configs.recommended,
    ...tseslint.configs.recommended.map((config) => ({
        ...config,
        files: ["src/**/*.ts"],
    })),
    {
        files: ["src/**/*.ts"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                ...nodeGlobals,
                ...bunGlobals,
            },
        },
        rules: {
            "@typescript-eslint/no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_" },
            ],
        },
    },
);
