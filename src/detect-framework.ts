import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Framework = "nextjs" | "vite-tanstack-router";

const NEXTJS_CONFIG_FILES = [
    "next.config.ts",
    "next.config.js",
    "next.config.mjs",
];

export function detectFramework(cwd: string): Framework {
    for (const configFile of NEXTJS_CONFIG_FILES) {
        if (existsSync(join(cwd, configFile))) {
            return "nextjs";
        }
    }

    const pkgPath = join(cwd, "package.json");
    if (existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
            const allDeps = {
                ...pkg.dependencies,
                ...pkg.devDependencies,
            };

            if (allDeps.next) {
                return "nextjs";
            }
        } catch {}
    }

    return "vite-tanstack-router";
}

export function getFrameworkLabel(framework: Framework): string {
    return framework === "nextjs" ? "Next.js" : "Vite + TanStack Router";
}

export function getNextConfigPath(cwd: string): string | null {
    for (const configFile of NEXTJS_CONFIG_FILES) {
        const path = join(cwd, configFile);
        if (existsSync(path)) {
            return path;
        }
    }
    return null;
}
