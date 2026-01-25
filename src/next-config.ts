import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getNextConfigPath } from "./detect-framework.js";

export interface NextConfigResult {
    status: "created" | "updated" | "already-configured" | "manual-required";
    path: string;
    message: string;
}

const STANDALONE_CONFIG = `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    output: "standalone",
};

export default nextConfig;
`;

export function ensureStandaloneOutput(cwd: string): NextConfigResult {
    const existingPath = getNextConfigPath(cwd);

    if (!existingPath) {
        const newPath = join(cwd, "next.config.ts");
        writeFileSync(newPath, STANDALONE_CONFIG);
        return {
            status: "created",
            path: newPath,
            message: "Created next.config.ts with standalone output",
        };
    }

    const content = readFileSync(existingPath, "utf-8");

    if (content.includes('"standalone"') || content.includes("'standalone'")) {
        return {
            status: "already-configured",
            path: existingPath,
            message: "next.config already has standalone output",
        };
    }

    if (content.includes("output:") || content.includes('"output"')) {
        return {
            status: "manual-required",
            path: existingPath,
            message:
                "next.config has different output setting - please update manually to output: 'standalone'",
        };
    }

    // Pattern 1: const x: NextConfig = { ... }
    let updated = content.replace(
        /(const\s+\w+:\s*NextConfig\s*=\s*\{)/,
        '$1\n    output: "standalone",',
    );

    // Pattern 2: module.exports = { ... } (for .js files)
    if (updated === content) {
        updated = content.replace(
            /(module\.exports\s*=\s*\{)/,
            '$1\n    output: "standalone",',
        );
    }

    // Pattern 3: export default { ... }
    if (updated === content) {
        updated = content.replace(
            /(export\s+default\s*\{)/,
            '$1\n    output: "standalone",',
        );
    }

    if (updated !== content) {
        writeFileSync(existingPath, updated);
        return {
            status: "updated",
            path: existingPath,
            message: "Added standalone output to next.config",
        };
    }

    return {
        status: "manual-required",
        path: existingPath,
        message:
            "Could not automatically update next.config - please add output: 'standalone' manually",
    };
}
