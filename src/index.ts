#!/usr/bin/env node

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

import { existsSync } from "node:fs";
import { join } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { detectFramework, getFrameworkLabel } from "./detect-framework.js";
import {
    detectPackageManager,
    getInstallCommand,
    type PackageManager,
} from "./detect-pm.js";
import { detectTooling, getToolingLabel } from "./detect-tooling.js";
import {
    buildSetupPlan,
    copyFile,
    type GeneratorContext,
    resolveGroups,
} from "./files.js";
import { updatePackageJson } from "./package-json.js";

function getSkillsInstallCommand(pm: PackageManager): string {
    switch (pm) {
        case "pnpm":
            return "pnpm dlx skills add shadcn/ui";
        case "yarn":
            return "yarn skills add shadcn/ui";
        case "bun":
            return "bunx --bun skills add shadcn/ui";
        default:
            return "npx skills add shadcn/ui";
    }
}

function cancelAndExit(message: string, exitCode = 0): never {
    p.cancel(message);
    process.exit(exitCode);
}

function logDetection(options: {
    inferred: boolean;
    detectedMessage: string;
    inferredMessage: string;
}): void {
    const { inferred, detectedMessage, inferredMessage } = options;

    if (inferred) {
        p.log.warn(inferredMessage);
        return;
    }

    p.log.info(detectedMessage);
}

async function multiselectOrExit<T extends string>(
    options: Parameters<typeof p.multiselect>[0],
): Promise<T[]> {
    const result = await p.multiselect(options);

    if (p.isCancel(result)) {
        cancelAndExit("Operation cancelled.");
    }

    return result as T[];
}

async function confirmOrExit(
    options: Parameters<typeof p.confirm>[0],
): Promise<void> {
    const result = await p.confirm(options);

    if (p.isCancel(result) || !result) {
        cancelAndExit("Operation cancelled.");
    }
}

async function main() {
    const cwd = process.cwd();

    p.intro("react-extras");

    if (!existsSync(join(cwd, "package.json"))) {
        cancelAndExit(
            "No package.json found. Run this in a React project directory.",
            1,
        );
    }

    const pmResult = detectPackageManager(cwd);
    const pm = pmResult.pm;
    logDetection({
        inferred: pmResult.inferred,
        inferredMessage: `No lock file found, assuming package manager: ${pm} (run "${pm} install" first if this is wrong)`,
        detectedMessage: `Detected package manager: ${pc.cyan(pm)}`,
    });

    const frameworkResult = detectFramework(cwd);
    const framework = frameworkResult.framework;
    logDetection({
        inferred: frameworkResult.inferred,
        inferredMessage: `Could not detect framework, assuming: ${getFrameworkLabel(framework)} (Dockerfile and workflows may need adjustment)`,
        detectedMessage: `Detected framework: ${pc.cyan(getFrameworkLabel(framework))}`,
    });

    const toolingResult = detectTooling(cwd);
    const tooling = toolingResult.tooling;
    logDetection({
        inferred: toolingResult.inferred,
        inferredMessage: `No linter config found, assuming: ${getToolingLabel(tooling)} (lint-staged config may need adjustment)`,
        detectedMessage: `Detected tooling: ${pc.cyan(getToolingLabel(tooling))}`,
    });

    const ctx: GeneratorContext = { cwd, pm, tooling, framework };
    const groups = resolveGroups(ctx);

    const selectedIds = await multiselectOrExit<(typeof groups)[number]["id"]>({
        message: "Select extras to add:",
        options: groups.map((group) => ({
            value: group.id,
            label: group.label,
            hint: group.hint,
        })),
        initialValues: groups.map((group) => group.id),
        required: false,
    });

    if (selectedIds.length === 0) {
        cancelAndExit("No extras selected.");
    }

    const selected = groups.filter((group) => selectedIds.includes(group.id));
    let plan = buildSetupPlan({ cwd, groups: selected });

    if (plan.fileStatus.length > 0) {
        p.log.message(pc.dim("Files to create:"));
        for (const { file, exists } of plan.fileStatus) {
            const status = exists ? pc.yellow(" (exists, will overwrite)") : "";
            p.log.message(`  ${file.targetPath}${status}`);
        }
    }

    let filesToSkip: string[] = [];
    if (plan.existingFiles.length > 0) {
        const filesToOverwrite = await multiselectOrExit<string>({
            message: "Some files already exist. Select files to overwrite:",
            options: plan.existingFiles.map(({ file }) => ({
                value: file.targetPath,
                label: file.targetPath,
            })),
            required: false,
        });
        filesToSkip = plan.existingFiles
            .filter(({ file }) => !filesToOverwrite.includes(file.targetPath))
            .map(({ file }) => file.targetPath);
        plan = buildSetupPlan({ cwd, groups: selected, filesToSkip });
    }

    if (plan.requiredDeps.length > 0) {
        p.log.message(pc.dim("Dependencies to install:"));
        for (const dep of plan.requiredDeps) {
            p.log.message(`  ${pc.cyan(dep)}`);
        }
    }

    await confirmOrExit({
        message: "Proceed with setup?",
    });

    const s = p.spinner();

    if (plan.filesToApply.length > 0) {
        s.start("Copying template files...");

        for (const file of plan.filesToApply) {
            copyFile(cwd, file, ctx);
        }

        s.stop("Template files copied");
    }

    s.start("Updating package.json...");
    const { added } = updatePackageJson({
        cwd,
        mods: plan.packageJsonMods,
    });

    if (added.length > 0) {
        s.stop(`Updated package.json: added ${added.join(", ")}`);
    } else {
        s.stop("package.json already configured");
    }

    if (plan.requiredDeps.length > 0) {
        s.start(`Installing ${plan.requiredDeps.join(", ")}...`);
        const installCmd = getInstallCommand(pm, plan.requiredDeps);

        try {
            await execAsync(installCmd, { cwd });
            s.stop("Dependencies installed");
        } catch {
            s.stop("Failed to install dependencies");
            p.log.warn(`Run manually: ${installCmd}`);
        }
    }

    p.outro("Setup complete!");

    const nextSteps = [
        ...plan.immediateNextSteps,
        `Run ${pc.cyan(getSkillsInstallCommand(pm))} to give AI assistants like Claude Code project-aware context about shadcn/ui.`,
        "Review the created files",
        ...plan.followUpNextSteps,
    ];

    p.log.message(`${pc.dim("Next steps:")}
  ${nextSteps
      .map((step, index) => `${pc.dim(`${index + 1}.`)} ${step}`)
      .join("\n  ")}`);
}

main().catch((err) => {
    p.log.error(err.message);
    process.exit(1);
});
