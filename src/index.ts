#!/usr/bin/env node

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

import { existsSync } from "node:fs";
import { join } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { detectFramework, getFrameworkLabel } from "./detect-framework.js";
import { detectPackageManager, getInstallCommand } from "./detect-pm.js";
import { detectTooling, getToolingLabel } from "./detect-tooling.js";
import {
    checkExistingFiles,
    copyTemplateFile,
    type GeneratorContext,
    getPackageJsonMods,
    getRequiredDependencies,
    getTemplateFiles,
} from "./files.js";
import { ensureStandaloneOutput } from "./next-config.js";
import { updatePackageJson } from "./package-json.js";

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

    const allTemplateFiles = getTemplateFiles(cwd, framework, tooling);

    const selectedExtras = await p.multiselect({
        message: "Select extras to add:",
        options: allTemplateFiles.map((file) => ({
            value: file.targetPath,
            label: file.label,
            hint: file.targetPath,
        })),
        initialValues: allTemplateFiles.map((f) => f.targetPath),
        required: false,
    });

    if (p.isCancel(selectedExtras)) {
        p.cancel("Operation cancelled.");
        process.exit(0);
    }

    const selectedPaths = selectedExtras as string[];
    if (selectedPaths.length === 0) {
        p.cancel("No extras selected.");
        process.exit(0);
    }

    const templateFiles = allTemplateFiles.filter((f) =>
        selectedPaths.includes(f.targetPath),
    );
    const fileStatus = checkExistingFiles(cwd, templateFiles);
    const existingFiles = fileStatus.filter((f) => f.exists);

    p.log.message(pc.dim("Files to create:"));
    for (const { file, exists } of fileStatus) {
        const status = exists ? pc.yellow(" (exists, will overwrite)") : "";
        p.log.message(`  ${file.targetPath}${status}`);
    }

    if (framework === "nextjs") {
        p.log.message(
            "  next.config.ts (will be updated for standalone output)",
        );
    }

    let filesToSkip: string[] = [];
    if (existingFiles.length > 0) {
        const overwriteChoice = await p.multiselect({
            message: "Some files already exist. Select files to overwrite:",
            options: existingFiles.map(({ file }) => ({
                value: file.targetPath,
                label: file.targetPath,
                hint: file.label,
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

    const templateFilesToApply = templateFiles.filter(
        (f) => !filesToSkip.includes(f.targetPath),
    );
    const requiredDeps = getRequiredDependencies(templateFilesToApply);

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

    // Handle Next.js specific configuration
    let nextConfigManualRequired = false;
    if (framework === "nextjs") {
        s.start("Configuring Next.js for standalone output...");
        const result = ensureStandaloneOutput(cwd);

        switch (result.status) {
            case "created":
                s.stop("Created next.config.ts with standalone output");
                break;
            case "updated":
                s.stop("Updated next.config with standalone output");
                break;
            case "already-configured":
                s.stop("Next.js already configured for standalone output");
                break;
            case "manual-required":
                nextConfigManualRequired = true;
                s.stop("! Could not update next.config automatically");
                p.log.error(
                    `Action required: ${result.message}\n` +
                        `   File: ${result.path}\n` +
                        `   Without this, Docker deployment will fail.`,
                );
                break;
        }
    }

    s.start("Copying template files...");

    for (const { file } of fileStatus) {
        if (!filesToSkip.includes(file.targetPath)) {
            copyTemplateFile(cwd, file, pm, tooling, framework);
        }
    }

    s.stop("Template files copied");

    const ctx: GeneratorContext = { cwd, pm, tooling, framework };
    const mods = getPackageJsonMods(templateFilesToApply, ctx);

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

    if (nextConfigManualRequired) {
        p.outro("Setup complete (with warnings)");
    } else {
        p.outro("Setup complete!");
    }

    if (nextConfigManualRequired) {
        p.log.message(`${pc.dim("Next steps:")}
  ${pc.yellow("1.")} Add output: "standalone" to your next.config ${pc.dim("(required for Docker)")}
  ${pc.dim("2.")} Review the created files
  ${pc.dim("3.")} Update .github/workflows/deploy.yml with your settings
  ${pc.dim("4.")} Make a commit to test the pre-commit hook`);
    } else {
        p.log.message(`${pc.dim("Next steps:")}
  ${pc.dim("1.")} Review the created files
  ${pc.dim("2.")} Update .github/workflows/deploy.yml with your settings
  ${pc.dim("3.")} Make a commit to test the pre-commit hook`);
    }
}

main().catch((err) => {
    p.log.error(err.message);
    process.exit(1);
});
