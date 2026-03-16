import simpleGit, { SimpleGit, SimpleGitOptions } from "simple-git";
import path from "path";
import fs from 'fs';

import { getWorkspacePath, registerWorkspace, touchWorkspace, WORKSPACES_BASE_DIR } from './local-resgistry'


import type { GitOperationResult, GitStatus } from "@/src/app/features/ide/extensions/chat/types/types";


// ── Git instance factory ──────────────────────────────────────────────────────

function getGit(workspacePath: string): SimpleGit {
    const options: Partial<SimpleGitOptions> = {
        baseDir: workspacePath,
        binary: "git",
        maxConcurrentProcesses: 4,
        trimmed: true,
    };
    return simpleGit(options);
}



// ── Init (new local project, no remote) ──────────────────────────────────────


export async function initWorkspace(workspaceId: string, projectName: string): Promise<GitOperationResult> {

    const hostPath = registerWorkspace(workspaceId, projectName);
    const git = getGit(hostPath);

    try {

        const isRepo = fs.existsSync(path.join(hostPath, '.git'));
        if (isRepo) {
            return {
                success: true,
                output: "Already a git repository",
                isDirty: false,
            };
        }

        await git.init();
        await git.addConfig("user.email", "web-ide@localhost");
        await git.addConfig("user.name", "Web IDE");


        // Create a default .gitignore
        const gitignore = [
            "node_modules/",
            "dist/",
            "build/",
            ".next/",
            "target/",
            "*.class",
            "__pycache__/",
            "*.pyc",
            ".env",
            ".env.local",
        ].join("\n");

        fs.writeFileSync(path.join(hostPath, '.gitignore'), gitignore);

        // Initial commit so the repo has a HEAD
        await git.add(".gitignore");
        await git.commit("Initial commit");

        console.log(`[Git] Initialized: ${workspaceId} at ${hostPath}`);
        return { success: true, output: "Initialized new git repository" };


    } catch (err: any) {
        console.error(`[Git] Init failed: ${workspaceId}`, err);
        return { success: false, output: "", error: err.message };
    }



}


// ── Clone (import from GitHub) ────────────────────────────────────────────────


export async function cloneWorkspace(
    workspaceId: string,
    projectName: string,
    remoteUrl: string,
    branch = "main",
    onProgress?: (stage: string, percent?: number) => void,
): Promise<GitOperationResult> {

    const hostPath = path.join(WORKSPACES_BASE_DIR, workspaceId);


    try {

        onProgress?.("Cloning Repository", 0);


        const git = simpleGit({
            progress({ method, stage, progress }) {
                onProgress?.(`${method} ${stage}`, progress);
            },
        });

        await git.clone(remoteUrl, hostPath, [
            "--branch", branch,
            "--depth", "1",      // shallow clone — fast, saves disk
            "--single-branch",
        ])

        registerWorkspace(workspaceId, projectName, hostPath);

        const clonedGit = getGit(hostPath);
        await clonedGit.addConfig("user.email", "web-ide@localhost");
        await clonedGit.addConfig("user.name", "Web IDE");

        // Get initial commit SHA
        const log = await clonedGit.log({ maxCount: 1 });
        const commitSha = log.latest?.hash?.slice(0, 7);

        onProgress?.("Done", 100);
        console.log(`[Git] Cloned: ${remoteUrl} → ${hostPath}`);

        return {
            success: true,
            output: `Cloned ${remoteUrl} (${branch})`,
            branch,
            commitSha,
            isDirty: false,
        };

    } catch (err: any) {
        console.error(`[Git] Clone failed:`, err);
        // Clean up partial clone
        if (fs.existsSync(hostPath)) {
            fs.rmSync(hostPath, { recursive: true, force: true });
        }
        return { success: false, output: "", error: err.message };
    }


}

// ── Status ────────────────────────────────────────────────────────────────────


export async function getGitStatus(workspaceId: string): Promise<GitOperationResult> {


    const hostPath = getWorkspacePath(workspaceId);

    const git = getGit(hostPath);

    try {

        const status = await git.status();
        const log = await git.log({ maxCount: 1 }).catch(() => null);


        const fileStatuses: GitOperationResult["fileStatuses"] = [
            ...status.modified.map(p => ({ path: p, status: "modified" as GitStatus })),
            ...status.not_added.map(p => ({ path: p, status: "untracked" as GitStatus })),
            ...status.created.map(p => ({ path: p, status: "added" as GitStatus })),
            ...status.deleted.map(p => ({ path: p, status: "deleted" as GitStatus })),
        ];

        return {
            success: true,
            output: status.isClean() ? "Clean" : `${fileStatuses.length} changed file(s)`,
            branch: status.current ?? "unknown",
            commitSha: log?.latest?.hash?.slice(0, 7),
            isDirty: !status.isClean(),
            fileStatuses,
        };
    } catch (err: any) {
        return { success: false, output: "", error: err.message };
    }



}


// ── Auto-save commit ──────────────────────────────────────────────────────────
// Called every 60s from auto-save.ts if workspace is dirty

export async function autoCommit(workspaceId: string, message = "auto-save"): Promise<GitOperationResult> {


    const hostPath = getWorkspacePath(workspaceId);

    const git = getGit(hostPath);

    try {

        const status = await git.status();

        // Nothing changed
        if (status.isClean()) {
            return { success: true, output: "Nothing to commit", isDirty: false };

        }

        await git.add(".");
        const result = await git.commit(
            `${message} — ${new Date().toISOString().slice(0, 16).replace("T", " ")}`
        );


        const commitSha = result.commit.slice(0, 7);
        console.log(`[Git] Auto-commit: ${workspaceId} → ${commitSha}`);

        touchWorkspace(workspaceId);

        return {
            success: true,
            output: `Committed ${result.summary.changes} change(s)`,
            commitSha,
            isDirty: false,
        };

    } catch (err: any) {
        console.error(`[Git] Auto-commit failed: ${workspaceId}`, err);
        return { success: false, output: "", error: err.message };
    }


}



// ── Push to remote ────────────────────────────────────────────────────────────
// Called on workspace close, or manually

export async function pushToRemote(
    workspaceId: string,
    branch?: string,
): Promise<GitOperationResult> {
    const hostPath = getWorkspacePath(workspaceId);
    const git = getGit(hostPath);

    try {
        const status = await git.status();
        const currentBranch = branch ?? status.current ?? "main";

        // Make sure there's a remote
        const remotes = await git.getRemotes(true);
        if (remotes.length === 0) {
            return {
                success: false,
                output: "",
                error: "No remote configured. Add a remote first.",
            };
        }

        await git.push("origin", currentBranch, ["--set-upstream"]);

        console.log(`[Git] Pushed: ${workspaceId} → origin/${currentBranch}`);
        return {
            success: true,
            output: `Pushed to origin/${currentBranch}`,
            branch: currentBranch,
        };

    } catch (err: any) {
        console.error(`[Git] Push failed: ${workspaceId}`, err);
        return { success: false, output: "", error: err.message };
    }
}


// ── Pull from remote ──────────────────────────────────────────────────────────

export async function pullFromRemote(
    workspaceId: string,
): Promise<GitOperationResult> {
    const hostPath = getWorkspacePath(workspaceId);
    const git = getGit(hostPath);

    try {
        const result = await git.pull();
        return {
            success: true,
            output: result.summary.changes > 0
                ? `Pulled ${result.summary.changes} change(s)`
                : "Already up to date",
        };
    } catch (err: any) {
        return { success: false, output: "", error: err.message };
    }
}


// ── Add remote ────────────────────────────────────────────────────────────────
// Called when user connects a local workspace to GitHub for the first time

export async function addRemote(
    workspaceId: string,
    remoteUrl: string,
    remoteName = "origin",
): Promise<GitOperationResult> {
    const hostPath = getWorkspacePath(workspaceId);
    const git = getGit(hostPath);

    try {
        // Remove existing remote with same name if present
        const remotes = await git.getRemotes();
        if (remotes.find(r => r.name === remoteName)) {
            await git.removeRemote(remoteName);
        }

        await git.addRemote(remoteName, remoteUrl);

        console.log(`[Git] Remote added: ${workspaceId} → ${remoteUrl}`);
        return { success: true, output: `Remote '${remoteName}' set to ${remoteUrl}` };

    } catch (err: any) {
        return { success: false, output: "", error: err.message };
    }
}


// ── Branch operations ─────────────────────────────────────────────────────────

export async function listBranches(workspaceId: string): Promise<string[]> {
    const hostPath = getWorkspacePath(workspaceId);
    const git = getGit(hostPath);
    try {
        const branches = await git.branchLocal();
        return branches.all;
    } catch {
        return [];
    }
}

export async function createBranch(
    workspaceId: string,
    branchName: string,
): Promise<GitOperationResult> {
    const hostPath = getWorkspacePath(workspaceId);
    const git = getGit(hostPath);
    try {
        await git.checkoutLocalBranch(branchName);
        return { success: true, output: `Switched to new branch '${branchName}'`, branch: branchName };
    } catch (err: any) {
        return { success: false, output: "", error: err.message };
    }
}

export async function switchBranch(
    workspaceId: string,
    branchName: string,
): Promise<GitOperationResult> {
    const hostPath = getWorkspacePath(workspaceId);
    const git = getGit(hostPath);
    try {
        await git.checkout(branchName);
        return { success: true, output: `Switched to branch '${branchName}'`, branch: branchName };
    } catch (err: any) {
        return { success: false, output: "", error: err.message };
    }
}

// ── Git log (for history display in UI) ───────────────────────────────────────

export type CommitEntry = {
    hash: string;
    shortHash: string;
    message: string;
    author: string;
    date: string;
};


export async function getCommitLog(

    workspaceId: string,
    maxCount = 20,

): Promise<CommitEntry[]> {

    const hostPath = getWorkspacePath(workspaceId);

    const git = getGit(hostPath);

    try {

        const log = await git.log({ maxCount });

        return (log.all ?? []).map(entry => ({

            hash: entry.hash,
            shortHash: entry.hash.slice(0, 7),
            message: entry.message,
            author: entry.author_name,
            date: entry.date,

        }));

    } catch {

        return [];
    }
}

