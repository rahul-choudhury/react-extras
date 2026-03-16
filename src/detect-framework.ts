import { existsSync } from "node:fs";
import { join } from "node:path";
import { getAllDependencies, tryReadPackageJson } from "./package-json.js";

export type Framework = "nextjs" | "vite-tanstack-router";

export interface FrameworkDetectionResult {
    framework: Framework;
    inferred: boolean;
}

const NEXTJS_CONFIG_FILES = [
    "next.config.ts",
    "next.config.js",
    "next.config.cjs",
    "next.config.mjs",
];

export function detectFramework(cwd: string): FrameworkDetectionResult {
    for (const configFile of NEXTJS_CONFIG_FILES) {
        if (existsSync(join(cwd, configFile))) {
            return { framework: "nextjs", inferred: false };
        }
    }

    const pkg = tryReadPackageJson(cwd);
    if (pkg) {
        const allDeps = getAllDependencies(pkg);

        if (allDeps.next) {
            return { framework: "nextjs", inferred: false };
        }

        // Check for Vite + TanStack Router specifically
        if (allDeps.vite && allDeps["@tanstack/react-router"]) {
            return { framework: "vite-tanstack-router", inferred: false };
        }
    }

    return { framework: "vite-tanstack-router", inferred: true };
}

export function getFrameworkLabel(framework: Framework): string {
    return framework === "nextjs" ? "Next.js" : "Vite + TanStack Router";
}
