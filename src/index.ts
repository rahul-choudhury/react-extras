#!/usr/bin/env node

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

import { existsSync } from "node:fs";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { detectPackageManager, getInstallCommand } from "./detect-pm.js";
import {
    detectTooling,
    getLintStagedConfig,
    getToolingLabel,
} from "./detect-tooling.js";
import { checkExistingFiles, copyTemplateFile } from "./files.js";
import { updatePackageJson } from "./package-json.js";

async function main() {
    const cwd = process.cwd();

    p.intro("create-react-app-extras");

    if (!existsSync(join(cwd, "package.json"))) {
        p.cancel(
            "No package.json found. Run this in a React project directory.",
        );
        process.exit(1);
    }

    const pm = detectPackageManager(cwd);
    p.log.info(`Detected package manager: ${pm}`);

    const tooling = detectTooling(cwd);
    p.log.info(`Detected tooling: ${getToolingLabel(tooling)}`);

    const fileStatus = checkExistingFiles(cwd);
    const existingFiles = fileStatus.filter((f) => f.exists);

    p.log.message("Files to create:");
    for (const { file, exists } of fileStatus) {
        const status = exists ? " (exists, will overwrite)" : "";
        p.log.message(`  ${file.targetPath}${status}`);
    }

    p.log.message("Dependencies to install:");
    p.log.message("  husky");
    p.log.message("  lint-staged");

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

    const shouldContinue = await p.confirm({
        message: "Proceed with setup?",
    });

    if (p.isCancel(shouldContinue) || !shouldContinue) {
        p.cancel("Operation cancelled.");
        process.exit(0);
    }

    const s = p.spinner();
    s.start("Copying template files...");

    for (const { file } of fileStatus) {
        if (!filesToSkip.includes(file.targetPath)) {
            copyTemplateFile(cwd, file, pm, tooling);
        }
    }

    s.stop("Template files copied");

    s.start("Updating package.json...");
    const lintStagedConfig = getLintStagedConfig(tooling);
    const { addedPrepare, addedLintStaged } = updatePackageJson(
        cwd,
        lintStagedConfig,
    );

    const updates: string[] = [];
    if (addedPrepare) updates.push("prepare script");
    if (addedLintStaged) updates.push("lint-staged config");

    if (updates.length > 0) {
        s.stop(`Updated package.json: added ${updates.join(", ")}`);
    } else {
        s.stop("package.json already configured");
    }

    s.start("Installing husky and lint-staged...");
    const installCmd = getInstallCommand(pm, ["husky", "lint-staged"]);

    try {
        await execAsync(installCmd, { cwd });
        s.stop("Dependencies installed");
    } catch {
        s.stop("Failed to install dependencies");
        p.log.warning(`Run manually: ${installCmd}`);
    }

    p.outro("Setup complete!");

    p.log.message("Next steps:");
    p.log.message("  1. Review the created files");
    p.log.message(
        "  2. Update .github/workflows/deploy.yml with your settings",
    );
    p.log.message("  3. Make a commit to test the pre-commit hook");
}

main().catch((err) => {
    p.log.error(err.message);
    process.exit(1);
});
