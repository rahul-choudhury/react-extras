import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    type GeneratorContext,
    type NextStepDefinition,
    type PackageJsonMods,
    TEMPLATE_GROUPS,
    type TemplateGroupId,
} from "./templates.js";

export type { GeneratorContext } from "./templates.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ResolvedFile {
    targetPath: string;
    render: (ctx: GeneratorContext) => string;
    executable: boolean;
}

export interface ResolvedGroup {
    id: TemplateGroupId;
    label: string;
    hint: string;
    files: ResolvedFile[];
    packages: string[];
    nextSteps: NextStepDefinition[];
    packageJsonMods: ResolvedPackageJsonMods;
}

export interface ResolvedPackageJsonMods {
    scripts: Record<string, string>;
    config: Record<string, unknown>;
}

export interface FileStatus {
    file: ResolvedFile;
    exists: boolean;
}

export interface SetupPlan {
    fileStatus: FileStatus[];
    existingFiles: FileStatus[];
    filesToApply: ResolvedFile[];
    requiredDeps: string[];
    packageJsonMods: ResolvedPackageJsonMods;
    immediateNextSteps: string[];
    followUpNextSteps: string[];
}

function resolvePackageJsonMods(
    packageJson:
        | PackageJsonMods
        | ((ctx: GeneratorContext) => PackageJsonMods)
        | undefined,
    ctx: GeneratorContext,
): ResolvedPackageJsonMods {
    const mods =
        typeof packageJson === "function" ? packageJson(ctx) : packageJson;

    return {
        scripts: { ...(mods?.scripts ?? {}) },
        config: { ...(mods?.config ?? {}) },
    };
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

            files.push({
                targetPath,
                render: def.render,
                executable: def.executable ?? false,
            });
        }

        if (files.length === 0) continue;

        const hint = files.map((f) => f.targetPath).join(", ");
        const nextSteps =
            typeof group.nextSteps === "function"
                ? group.nextSteps(ctx)
                : (group.nextSteps ?? []);

        resolved.push({
            id: group.id,
            label: group.label,
            hint,
            files,
            packages: group.packages ?? [],
            nextSteps,
            packageJsonMods: resolvePackageJsonMods(group.packageJson, ctx),
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
): FileStatus[] {
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

    writeFileSync(targetPath, file.render(ctx));

    if (file.executable) {
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
): ResolvedPackageJsonMods {
    const scripts: Record<string, string> = {};
    const config: Record<string, unknown> = {};

    for (const group of groups) {
        for (const [key, value] of Object.entries(
            group.packageJsonMods.scripts,
        )) {
            if (!(key in scripts)) {
                scripts[key] = value;
            }
        }

        for (const [key, value] of Object.entries(
            group.packageJsonMods.config,
        )) {
            if (!(key in config)) {
                config[key] = value;
            }
        }
    }

    return { scripts, config };
}

export interface BuildSetupPlanOptions {
    cwd: string;
    groups: ResolvedGroup[];
    filesToSkip?: string[];
}

export function buildSetupPlan(options: BuildSetupPlanOptions): SetupPlan {
    const { cwd, groups, filesToSkip = [] } = options;
    const allFiles = groups.flatMap((group) => group.files);
    const fileStatus = checkExistingFiles(cwd, allFiles);
    const existingFiles = fileStatus.filter((status) => status.exists);
    const skippedFiles = new Set(filesToSkip);

    return {
        fileStatus,
        existingFiles,
        filesToApply: allFiles.filter(
            (file) => !skippedFiles.has(file.targetPath),
        ),
        requiredDeps: getRequiredPackages(groups),
        packageJsonMods: getPackageJsonMods(groups),
        immediateNextSteps: groups.flatMap((group) =>
            group.nextSteps
                .filter((step) => step.stage === "before-review")
                .map((step) => step.text),
        ),
        followUpNextSteps: groups.flatMap((group) =>
            group.nextSteps
                .filter((step) => step.stage !== "before-review")
                .map((step) => step.text),
        ),
    };
}
