import {
    chmodSync,
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    type ContentResolver,
    type GeneratorContext,
    type PackageJsonMods,
    TEMPLATE_GROUPS,
} from "./templates.js";

export type { GeneratorContext } from "./templates.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ResolvedFile {
    targetPath: string;
    content: ContentResolver;
}

interface ResolvedGroup {
    label: string;
    hint: string;
    files: ResolvedFile[];
    packages: string[];
    packageJson?:
        | PackageJsonMods
        | ((ctx: GeneratorContext) => PackageJsonMods);
}

interface ResolvedPackageJsonMods {
    scripts: Record<string, string>;
    config: Record<string, unknown>;
}

export function resolveGroups(ctx: GeneratorContext): ResolvedGroup[] {
    const resolved: ResolvedGroup[] = [];

    for (const group of TEMPLATE_GROUPS) {
        const files: ResolvedFile[] = [];

        for (const def of group.files) {
            if (def.when && !def.when(ctx)) continue;

            const targetPath =
                typeof def.targetPath === "function"
                    ? def.targetPath(ctx)
                    : def.targetPath;

            files.push({ targetPath, content: def.content });
        }

        if (files.length === 0) continue;

        resolved.push({
            label: group.label,
            hint: files.map((f) => f.targetPath).join(", "),
            files,
            packages: group.packages ?? [],
            packageJson: group.packageJson,
        });
    }

    return resolved;
}

export function getTemplatesDir(): string {
    return join(__dirname, "..", "templates");
}

export function checkExistingFiles(
    cwd: string,
    files: ResolvedFile[],
): { file: ResolvedFile; exists: boolean }[] {
    return files.map((file) => ({
        file,
        exists: existsSync(join(cwd, file.targetPath)),
    }));
}

export function copyFile(
    cwd: string,
    file: ResolvedFile,
    ctx: GeneratorContext,
): void {
    const targetPath = join(cwd, file.targetPath);
    mkdirSync(dirname(targetPath), { recursive: true });

    let content: string;
    if (file.content.type === "dynamic") {
        content = file.content.generate(ctx);
    } else {
        content = readFileSync(
            join(getTemplatesDir(), file.content.templatePath),
            "utf-8",
        );
    }

    writeFileSync(targetPath, content);

    if (file.targetPath.startsWith(".husky/")) {
        try {
            chmodSync(targetPath, 0o755);
        } catch {}
    }
}

export function getRequiredPackages(groups: ResolvedGroup[]): string[] {
    const deps = new Set<string>();
    for (const group of groups) {
        for (const pkg of group.packages) {
            deps.add(pkg);
        }
    }
    return [...deps];
}

export function getPackageJsonMods(
    groups: ResolvedGroup[],
    ctx: GeneratorContext,
): ResolvedPackageJsonMods {
    const scripts: Record<string, string> = {};
    const config: Record<string, unknown> = {};

    for (const group of groups) {
        if (!group.packageJson) continue;

        const mods =
            typeof group.packageJson === "function"
                ? group.packageJson(ctx)
                : group.packageJson;

        if (mods.scripts) {
            for (const [key, value] of Object.entries(mods.scripts)) {
                if (!(key in scripts)) {
                    scripts[key] = value;
                }
            }
        }

        if (mods.config) {
            for (const [key, value] of Object.entries(mods.config)) {
                if (!(key in config)) {
                    config[key] = value;
                }
            }
        }
    }

    return { scripts, config };
}
