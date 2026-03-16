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
    checkExistingFiles,
    copyFile,
    type GeneratorContext,
    getPackageJsonMods,
    getRequiredPackages,
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

async function main() {
    const cwd = process.cwd();

    p.intro("react-extras");

    if (!existsSync(join(cwd, "package.json"))) {
        p.cancel(
            "No package.json found. Run this in a React project directory.",
        );
        process.exit(1);
    }

    const pmResult = detectPackageManager(cwd);
    const pm = pmResult.pm;
    if (pmResult.inferred) {
        p.log.warn(
            `No lock file found, assuming package manager: ${pm} (run "${pm} install" first if this is wrong)`,
        );
    } else {
        p.log.info(`Detected package manager: ${pc.cyan(pm)}`);
    }

    const frameworkResult = detectFramework(cwd);
    const framework = frameworkResult.framework;
    if (frameworkResult.inferred) {
        p.log.warn(
            `Could not detect framework, assuming: ${getFrameworkLabel(framework)} (Dockerfile and workflows may need adjustment)`,
        );
    } else {
        p.log.info(
            `Detected framework: ${pc.cyan(getFrameworkLabel(framework))}`,
        );
    }

    const toolingResult = detectTooling(cwd);
    const tooling = toolingResult.tooling;
    if (toolingResult.inferred) {
        p.log.warn(
            `No linter config found, assuming: ${getToolingLabel(tooling)} (lint-staged config may need adjustment)`,
        );
    } else {
        p.log.info(`Detected tooling: ${pc.cyan(getToolingLabel(tooling))}`);
    }

    const ctx: GeneratorContext = { cwd, pm, tooling, framework };
    const groups = resolveGroups(ctx);

    const selectedGroups = await p.multiselect({
        message: "Select extras to add:",
        options: groups.map((group) => ({
            value: group.id,
            label: group.label,
            hint: group.hint,
        })),
        initialValues: groups.map((group) => group.id),
        required: false,
    });

    if (p.isCancel(selectedGroups)) {
        p.cancel("Operation cancelled.");
        process.exit(0);
    }

    const selectedIds = selectedGroups as Array<(typeof groups)[number]["id"]>;
    if (selectedIds.length === 0) {
        p.cancel("No extras selected.");
        process.exit(0);
    }

    const selected = groups.filter((group) => selectedIds.includes(group.id));
    const allFiles = selected.flatMap((g) => g.files);
    const fileStatus = checkExistingFiles(cwd, allFiles);
    const existingFiles = fileStatus.filter((f) => f.exists);

    if (allFiles.length > 0) {
        p.log.message(pc.dim("Files to create:"));
        for (const { file, exists } of fileStatus) {
            const status = exists ? pc.yellow(" (exists, will overwrite)") : "";
            p.log.message(`  ${file.targetPath}${status}`);
        }
    }

    let filesToSkip: string[] = [];
    if (existingFiles.length > 0) {
        const overwriteChoice = await p.multiselect({
            message: "Some files already exist. Select files to overwrite:",
            options: existingFiles.map(({ file }) => ({
                value: file.targetPath,
                label: file.targetPath,
            })),
            required: false,
        });

        if (p.isCancel(overwriteChoice)) {
            p.cancel("Operation cancelled.");
            process.exit(0);
        }

        const filesToOverwrite = overwriteChoice as string[];
        filesToSkip = existingFiles
            .filter(({ file }) => !filesToOverwrite.includes(file.targetPath))
            .map(({ file }) => file.targetPath);
    }

    const filesToApply = allFiles.filter(
        (f) => !filesToSkip.includes(f.targetPath),
    );
    const requiredDeps = getRequiredPackages(selected);

    if (requiredDeps.length > 0) {
        p.log.message(pc.dim("Dependencies to install:"));
        for (const dep of requiredDeps) {
            p.log.message(`  ${pc.cyan(dep)}`);
        }
    }

    const shouldContinue = await p.confirm({
        message: "Proceed with setup?",
    });

    if (p.isCancel(shouldContinue) || !shouldContinue) {
        p.cancel("Operation cancelled.");
        process.exit(0);
    }

    const s = p.spinner();

    if (filesToApply.length > 0) {
        s.start("Copying template files...");

        for (const file of filesToApply) {
            copyFile(cwd, file, ctx);
        }

        s.stop("Template files copied");
    }

    const mods = getPackageJsonMods(selected, ctx);

    s.start("Updating package.json...");
    const { added } = updatePackageJson({ cwd, mods });

    if (added.length > 0) {
        s.stop(`Updated package.json: added ${added.join(", ")}`);
    } else {
        s.stop("package.json already configured");
    }

    if (requiredDeps.length > 0) {
        s.start(`Installing ${requiredDeps.join(", ")}...`);
        const installCmd = getInstallCommand(pm, requiredDeps);

        try {
            await execAsync(installCmd, { cwd });
            s.stop("Dependencies installed");
        } catch {
            s.stop("Failed to install dependencies");
            p.log.warn(`Run manually: ${installCmd}`);
        }
    }

    p.outro("Setup complete!");

    const immediateNextSteps = selected.flatMap((group) =>
        group.nextSteps
            .filter((step) => step.stage === "before-review")
            .map((step) => step.text),
    );
    const followUpNextSteps = selected.flatMap((group) =>
        group.nextSteps
            .filter((step) => step.stage !== "before-review")
            .map((step) => step.text),
    );
    const nextSteps = [
        ...immediateNextSteps,
        `Run ${pc.cyan(getSkillsInstallCommand(pm))} to give AI assistants like Claude Code project-aware context about shadcn/ui.`,
        "Review the created files",
        ...followUpNextSteps,
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
