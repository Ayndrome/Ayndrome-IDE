// import Docker from 'dockerode';
// import fs from 'fs';
// import path from 'path';
// import { getWorkspacePath, touchWorkspace, registerWorkspace, WORKSPACES_BASE_DIR } from '../workspace/local-registry';
// import process from 'process';

// const SANDBOX_IMAGE = "web-ide-sandbox:latest";
// const CONTAINER_WORKSPACE = "/workspace";
// const IDLE_TIMEOUT_MS = 30 * 60 * 100;
// const EXEC_TIMEOUT_DEFAULT = 60_000;
// const MAX_RAM_BYTES = 512 * 1024 * 1024; // 512MB
// const MAX_CPU_NANO = 1_500_000_000; // 1.5 CPU Cores per container


// const docker = new Docker();

// type SandboxEntry = {

//     workspaceId: string;
//     containerId: string;
//     containerName: string;
//     container: Docker.Container;
//     hostPath: string;
//     createdAt: number;
//     lastUsed: number
//     isBusy?: boolean;

// }


// const liveSandboxes = new Map<string, SandboxEntry>();



// function containerName(workspaceId: string): string {
//     return `web-ide-${workspaceId}`;
// }



// // ── Get or create sandbox ─────────────────────────────────────────────────────
// // This is the main entry point called before every exec operation.
// // Idempotent — safe to call on every tool call.

// export async function getOrCreateSandbox(workspaceId: string, projectName = "workspace"): Promise<SandboxEntry> {


//     const live = liveSandboxes.get(workspaceId);

//     // 1. Return live entry if healthy
//     if (live) {
//         live.lastUsed = Date.now();

//         try {

//             const info = await live.container.inspect();
//             if (info.State.Running) return live;

//             console.log(`[Sandbox] Restarting stopped container: ${workspaceId}`);

//             await live.container.start();
//             live.lastUsed = Date.now();

//             return live;


//         } catch {

//             liveSandboxes.delete(workspaceId);

//         }



//     }

//     // 2. Check if container exists in Docker but not in our map
//     //    (happens after server restart)

//     try {

//         const existing = docker.getContainer(containerName(workspaceId));
//         const info = await existing.inspect();

//         if (info.State.Running) {

//             console.log(`[Sandbox] Re-attaching to existing container: ${workspaceId}`);

//             const entry: SandboxEntry = {
//                 workspaceId,
//                 containerId: info.Id,
//                 containerName: info.Name.replace("/", ""),
//                 container: existing,
//                 hostPath: getWorkspacePath(workspaceId),
//                 createdAt: new Date(info.Created).getTime(),
//                 lastUsed: Date.now(),
//             };

//             liveSandboxes.set(workspaceId, entry);
//             return entry;

//         }

//     } catch (err: any) {
//         // Container doesn't exist → proceed to create
//     }

//     return await _createSandbox(workspaceId, projectName);




// }

// async function _createSandbox(workspaceId: string, projectName: string): Promise<SandboxEntry> {


//     const hostPath = getWorkspacePath(workspaceId);
//     if (!fs.existsSync(hostPath)) {
//         fs.mkdirSync(hostPath, { recursive: true });

//     }

//     try {

//         fs.chownSync(hostPath, process.getuid!(), process.getgid!());

//     } catch { // chown may fail if already correct - not critical 

//     }

//     const name = containerName(workspaceId);
//     console.log(`[Sandbox] Creating container: ${name}`);
//     console.log(`[Sandbox] Mounting: ${hostPath} → ${CONTAINER_WORKSPACE}`);


//     const container = await docker.createContainer({


//         Image: SANDBOX_IMAGE,
//         name,
//         Labels: {
//             "web-ide.workspace": workspaceId,
//             "web-ide.managed": "true",
//             "web-ide.projectName": projectName,
//         },

//         User: `${process.getuid!()}:${process.getgid!()}`,
//         WorkingDir: CONTAINER_WORKSPACE,
//         Tty: true,
//         OpenStdin: true,
//         AttachStdin: false,
//         AttachStderr: false,
//         AttachStdout: false,

//         Env: [
//             'HOME=/home/devuser',
//             'TERM=xterm-256color',
//             `WORKSPACE_ID=${workspaceId}`,

//             // npm cache to /tmp so it's never owned by wrong user

//             `NPM_CONFIG_CACHE=/tmp/npm-cache`,
//             `NPM_CONFIG_PREFIX=/tmp/npm-global`,
//             `PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/tmp/npm-global/bin:/usr/local/go/bin:/home/devuser/.cargo/bin`,
//             `GIT_CONFIG_NOSYSTEM=1`,
//             `GIT_AUTHOR_NAME=Web IDE`,
//             `GIT_AUTHOR_EMAIL=web-ide@localhost`,
//             `GIT_COMMITTER_NAME=Web IDE`,
//             `GIT_COMMITTER_EMAIL=web-ide@localhost`,
//         ],

//         HostConfig: {

//             Binds: [
//                 `${hostPath}:${CONTAINER_WORKSPACE}`
//             ],

//             Memory: MAX_RAM_BYTES,
//             NanoCpus: MAX_CPU_NANO,


//             PidsLimit: 256,

//             NetworkMode: "Bridge",

//             RestartPolicy: { Name: "no" },

//             CapDrop: ["NET_ADMIN", "SYS_ADMIN", "SYS_PTRACE"],

//         },

//     });

//     (await container).start();


//     const info: SandboxEntry = {
//         workspaceId,
//         containerId: container.id,
//         containerName: name,
//         container,
//         hostPath,
//         createdAt: Date.now(),
//         lastUsed: Date.now(),
//     };

//     liveSandboxes.set(workspaceId, info);
//     console.log(`[Sandbox] Started: ${name} (${container.id.slice(0, 12)})`);
//     return info;

// }



// export type ExecResult = {
//     stdout: string;
//     stderr: string;
//     exitCode: number;
//     output: string;     // stdout + stderr interleaved (what user sees)
//     timedOut: boolean;
// }


// export async function execInSandbox(workspaceId: string, command: string, options: {
//     cwd?: string;
//     timeout?: number;
//     onStdout?: (data: string) => void;
//     onStderr?: (data: string) => void;
//     env?: string[];
// } = {}): Promise<ExecResult> {


//     const sandbox = await getOrCreateSandbox(workspaceId);
//     sandbox.lastUsed = Date.now();
//     touchWorkspace(workspaceId);

//     const { cwd = CONTAINER_WORKSPACE, timeout = EXEC_TIMEOUT_DEFAULT, onStdout, onStderr, env } = options;

//     let stdout = "";
//     let stderr = "";
//     let output = "";
//     let timedOut = false;

//     // create exec instance

//     const exec = await sandbox.container.exec({
//         Cmd: ["bash", "-c", command],
//         WorkingDir: cwd,
//         AttachStderr: true,
//         AttachStdout: true,
//         AttachStdin: false,
//         Tty: false,
//         Env: env,
//     });

//     return new Promise((resolve, reject) => {

//         const timer = setTimeout(() => {

//             timedOut = true;

//             resolve({
//                 stdout,
//                 stderr,
//                 exitCode: -1,
//                 output,
//                 timedOut: true,
//             })

//         }, timeout);


//         exec.start({ hijack: true, stdin: false }, (err, stream) => {
//             if (err || !stream) {
//                 clearTimeout(timer);
//                 resolve({
//                     stdout: "",
//                     stderr: err?.message ?? "exec failed to start",
//                     output: err?.message ?? "exec failed to start",
//                     exitCode: 1,
//                     timedOut: false,
//                 });
//                 return;
//             }


//             // Docker multiplexes stdout and stderr on the same stream
//             // modem.demuxStream separates them into two writable streams

//             sandbox.container.modem.demuxStream(

//                 stream,

//                 {

//                     write: (chunk: Buffer) => {

//                         const str = chunk.toString("utf-8");
//                         stdout += str;
//                         output += str;
//                         onStdout?.(str);
//                     },

//                     end() { },


//                 } as any,

//                 {
//                     write: (chunk: Buffer) => {
//                         const str = chunk.toString("utf-8");
//                         stderr += str;
//                         output += str;
//                         onStderr?.(str);
//                     },
//                     end() { },
//                 } as any,

//             )

//             stream.on("end", async () => {
//                 clearTimeout(timer);
//                 if (timedOut) return;

//                 try {
//                     const inspected = await exec.inspect();
//                     resolve({
//                         stdout: stdout.trim(),
//                         stderr: stderr.trim(),
//                         output: output.trim(),
//                         exitCode: inspected.ExitCode ?? 0,
//                         timedOut: false,
//                     });
//                 } catch {
//                     resolve({
//                         stdout: stdout.trim(),
//                         stderr: stderr.trim(),
//                         output: output.trim(),
//                         exitCode: 0,
//                         timedOut: false,
//                     });
//                 }
//             });


//             stream.on("error", (streamErr) => {
//                 clearTimeout(timer);
//                 resolve({
//                     stdout,
//                     stderr: streamErr.message,
//                     output: output + streamErr.message,
//                     exitCode: 1,
//                     timedOut: false,
//                 });
//             });
//         });


//     })





// }


// // ── Stop sandbox (sleep — container exists but not running) ───────────────────


// export async function stopSandbox(workspaceId: string): Promise<void> {

//     const entry = liveSandboxes.get(workspaceId);

//     if (!entry) return;;

//     try {

//         await entry.container.stop({ t: 5 });
//         console.log(`[Sandbox] Stopped (sleeping): ${workspaceId}`);



//     } catch (err: any) {

//         if (err?.statusCode !== 304) {
//             console.error(`[Sandbox] Stop error: ${workspaceId}`, err?.message);

//         }

//     }

// }


// export async function destroySandbox(workspaceId: string): Promise<void> {
//     const entry = liveSandboxes.get(workspaceId);

//     try {
//         const container = entry?.container
//             ?? docker.getContainer(containerName(workspaceId));

//         await container.stop({ t: 2 }).catch(() => { });
//         await container.remove({ force: true });
//         console.log(`[Sandbox] Destroyed: ${workspaceId}`);
//     } catch (err: any) {
//         if (err?.statusCode !== 404) {
//             console.error(`[Sandbox] Destroy error:`, err?.message);
//         }
//     }

//     liveSandboxes.delete(workspaceId);
// }

// // ── List all managed containers ───────────────────────────────────────────────

// export async function listSandboxes(): Promise<Array<{
//     workspaceId: string;
//     containerId: string;
//     running: boolean;
//     lastUsed: number;
// }>> {
//     const containers = await docker.listContainers({
//         all: true,
//         filters: JSON.stringify({ label: ["web-ide.managed=true"] }),
//     });

//     return containers.map(c => ({
//         workspaceId: c.Labels["web-ide.workspaceId"] ?? "unknown",
//         containerId: c.Id.slice(0, 12),
//         running: c.State === "running",
//         lastUsed: liveSandboxes.get(
//             c.Labels["web-ide.workspaceId"]
//         )?.lastUsed ?? 0,
//     }));
// }



// // ── Idle container cleanup ────────────────────────────────────────────────────
// // Stops containers that haven't been used for IDLE_TIMEOUT_MS.
// // Called on an interval from server.ts.
// // Containers are stopped not destroyed — they wake instantly on next use.

// export async function stopIdleContainers(): Promise<void> {
//     const now = Date.now();

//     for (const [workspaceId, entry] of liveSandboxes.entries()) {
//         if (now - entry.lastUsed < IDLE_TIMEOUT_MS) continue;

//         try {
//             const info = await entry.container.inspect();
//             if (!info.State.Running) continue;

//             console.log(`[Sandbox] Idle timeout — stopping: ${workspaceId}`);
//             await stopSandbox(workspaceId);
//         } catch {
//             liveSandboxes.delete(workspaceId);
//         }
//     }
// }

// // ── Verify Docker is accessible ───────────────────────────────────────────────
// // Called from server.ts on startup — fails fast with clear error message

// export async function verifyDocker(): Promise<void> {
//     try {
//         const info = await docker.info();
//         console.log(
//             `[Sandbox] Docker verified ✓\n` +
//             `  Version:     ${info.ServerVersion}\n` +
//             `  Containers:  ${info.Containers} total, ${info.ContainersRunning} running\n` +
//             `  Images:      ${info.Images}\n` +
//             `  Storage:     ${info.Driver}`
//         );

//         // Verify our image exists
//         try {
//             await docker.getImage(SANDBOX_IMAGE).inspect();
//             console.log(`[Sandbox] Image '${SANDBOX_IMAGE}' found ✓`);
//         } catch {
//             throw new Error(
//                 `Docker image '${SANDBOX_IMAGE}' not found.\n` +
//                 `Run: docker build -t ${SANDBOX_IMAGE} ./docker/sandbox`
//             );
//         }
//     } catch (err: any) {
//         throw new Error(
//             `[Sandbox] Cannot connect to Docker: ${err.message}\n` +
//             `Make sure Docker is running: sudo systemctl start docker`
//         );
//     }
// }


// src/server/sandbox/sandbox-manager.ts
// Manages Docker containers as sandboxes — one per workspace.
// Core responsibilities:
//   - Create containers with correct UID, bind mounts, resource limits
//   - Keep a live registry of running containers in memory
//   - Execute commands inside containers (for agent tool calls)
//   - Stream stdout/stderr chunks back to caller in real time
//   - Sleep idle containers after 30min, wake on next request
//   - Never let a container operation crash the server

import Docker from "dockerode";
import path from "path";
import fs from "fs";
import {
    getWorkspacePath,
    registerWorkspace,
    touchWorkspace,
    WORKSPACES_BASE_DIR,
} from "../workspace/local-registry";
import { spawn } from "child_process";
// ── Config ────────────────────────────────────────────────────────────────────

const SANDBOX_IMAGE = "web-ide-sandbox";
const CONTAINER_WORKSPACE = "/workspace";
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;   // 30 min → sleep container
const EXEC_TIMEOUT_DEFAULT = 60_000;             // 60s default per command
const MAX_RAM_BYTES = 512 * 1024 * 1024; // 512MB per container
const MAX_CPU_NANO = 1_500_000_000;      // 1.5 CPU cores per container

// ── Docker client (connects to local socket /var/run/docker.sock) ─────────────

const docker = new Docker();

// ── In-memory container registry ─────────────────────────────────────────────
// Survives as long as the Node.js process is alive.
// On server restart we re-discover containers from Docker directly.

type SandboxEntry = {
    workspaceId: string;
    containerId: string;
    containerName: string;
    container: Docker.Container;
    hostPath: string;
    createdAt: number;
    lastUsed: number;
    isBusy?: boolean;
};

const liveSandboxes = new Map<string, SandboxEntry>();

// ── Container name ────────────────────────────────────────────────────────────

function containerName(workspaceId: string): string {
    // Docker container names must be [a-zA-Z0-9_.-]
    // Convex IDs are alphanumeric — safe as-is
    return `web-ide-${workspaceId}`;
}

// ── Get or create sandbox ─────────────────────────────────────────────────────
// This is the main entry point called before every exec operation.
// Idempotent — safe to call on every tool call.

export async function getOrCreateSandbox(
    workspaceId: string,
    projectName = "workspace",
): Promise<SandboxEntry> {
    // 1. Return live entry if healthy
    const live = liveSandboxes.get(workspaceId);
    if (live) {
        live.lastUsed = Date.now();
        try {
            const info = await live.container.inspect();
            if (info.State.Running) return live;
            // Container stopped (idle timeout, manual stop, etc.) — restart it
            console.log(`[Sandbox] Restarting stopped container: ${workspaceId}`);
            await live.container.start();
            live.lastUsed = Date.now();
            return live;
        } catch {
            // Container was removed externally — fall through to re-create
            liveSandboxes.delete(workspaceId);
        }
    }

    // 2. Check if container exists in Docker but not in our map
    //    (happens after server restart)
    try {
        const existing = docker.getContainer(containerName(workspaceId));
        const info = await existing.inspect();

        if (!info.State.Running) {
            console.log(`[Sandbox] Starting existing container: ${workspaceId}`);
            await existing.start();
        }


        // might have future errors
        const hostPath = registerWorkspace(workspaceId, projectName);
        const entry: SandboxEntry = {
            workspaceId,
            containerId: info.Id,
            containerName: containerName(workspaceId),
            container: existing,
            hostPath,
            createdAt: new Date(info.Created).getTime(),
            lastUsed: Date.now(),
        };
        liveSandboxes.set(workspaceId, entry);
        return entry;

    } catch {
        // Container doesn't exist at all — create fresh
    }

    // 3. Create brand new container
    return await _createSandbox(workspaceId, projectName);
}

// ── Create container ──────────────────────────────────────────────────────────

async function _createSandbox(
    workspaceId: string,
    projectName: string,
): Promise<SandboxEntry> {
    // Ensure workspace dir exists on host with correct ownership

    // might have future errors
    const hostPath = registerWorkspace(workspaceId, projectName);
    if (!fs.existsSync(hostPath)) {
        fs.mkdirSync(hostPath, { recursive: true });
    }

    // Fix ownership — must be owned by current user (UID 1000)
    // so container running as same UID can write to it
    try {
        fs.chownSync(hostPath, process.getuid!(), process.getgid!());
    } catch {
        // chown may fail if already correct — not critical
    }

    const name = containerName(workspaceId);
    console.log(`[Sandbox] Creating container: ${name}`);
    console.log(`[Sandbox] Mounting: ${hostPath} → ${CONTAINER_WORKSPACE}`);

    const container = await docker.createContainer({
        Image: SANDBOX_IMAGE,
        name,
        Labels: {
            "web-ide.workspaceId": workspaceId,
            "web-ide.managed": "true",
            "web-ide.projectName": projectName,
        },

        // Run as current user — prevents ALL permission issues
        User: `${process.getuid!()}:${process.getgid!()}`,

        WorkingDir: CONTAINER_WORKSPACE,
        Tty: true,    // needed for PTY terminal sessions
        OpenStdin: true,    // needed for interactive commands
        AttachStdin: false,
        AttachStdout: false,
        AttachStderr: false,

        // Environment inside container
        Env: [
            `HOME=/home/devuser`,
            `TERM=xterm-256color`,
            `WORKSPACE_ID=${workspaceId}`,
            // npm cache to /tmp so it's never owned by wrong user
            `NPM_CONFIG_CACHE=/tmp/npm-cache`,
            `NPM_CONFIG_PREFIX=/tmp/npm-global`,
            `PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/tmp/npm-global/bin:/usr/local/go/bin:/home/devuser/.cargo/bin`,
            `GIT_CONFIG_NOSYSTEM=1`,
            `GIT_AUTHOR_NAME=Web IDE`,
            `GIT_AUTHOR_EMAIL=web-ide@localhost`,
            `GIT_COMMITTER_NAME=Web IDE`,
            `GIT_COMMITTER_EMAIL=web-ide@localhost`,
        ],

        HostConfig: {
            // Bind mount workspace folder
            Binds: [
                `${hostPath}:${CONTAINER_WORKSPACE}:rw`,
            ],

            // Resource limits — protect your laptop
            Memory: MAX_RAM_BYTES,
            NanoCpus: MAX_CPU_NANO,

            // Prevent container from forking too many processes
            PidsLimit: 256,

            // Network — containers need internet for npm install
            NetworkMode: "bridge",

            // Restart policy — don't auto-restart (we manage lifecycle)
            RestartPolicy: { Name: "no" },

            // Security — drop dangerous capabilities
            CapDrop: ["NET_ADMIN", "SYS_ADMIN", "SYS_PTRACE"],
        },
    });

    await container.start();

    const info: SandboxEntry = {
        workspaceId,
        containerId: container.id,
        containerName: name,
        container,
        hostPath,
        createdAt: Date.now(),
        lastUsed: Date.now(),
    };

    liveSandboxes.set(workspaceId, info);
    console.log(`[Sandbox] Started: ${name} (${container.id.slice(0, 12)})`);
    return info;
}

// ── Exec command (for agent tool calls) ──────────────────────────────────────
// Non-interactive — captures stdout/stderr, returns when done.
// onStdout/onStderr called with each chunk for live streaming to ToolCard.

export type ExecResult = {
    stdout: string;
    stderr: string;
    output: string;   // stdout + stderr interleaved (what user sees)
    exitCode: number;
    timedOut: boolean;
};

// export async function execInSandbox(
//     workspaceId: string,
//     command: string,
//     opts: {
//         cwd?: string;
//         timeoutMs?: number;
//         onStdout?: (chunk: string) => void;
//         onStderr?: (chunk: string) => void;
//         env?: string[];
//     } = {},
// ): Promise<ExecResult> {
//     const sandbox = await getOrCreateSandbox(workspaceId);
//     sandbox.lastUsed = Date.now();
//     touchWorkspace(workspaceId);

//     const {
//         cwd = CONTAINER_WORKSPACE,
//         timeoutMs = EXEC_TIMEOUT_DEFAULT,
//         onStdout,
//         onStderr,
//         env = [],
//     } = opts;

//     let stdout = "";
//     let stderr = "";
//     let output = "";
//     let timedOut = false;

//     // Create exec instance
//     const exec = await sandbox.container.exec({
//         Cmd: ["bash", "-c", command],
//         WorkingDir: cwd,
//         AttachStdout: true,
//         AttachStderr: true,
//         AttachStdin: false,
//         Tty: false,    // non-interactive → clean demuxed output
//         Env: env,
//     });

//     return new Promise((resolve) => {
//         const timer = setTimeout(() => {
//             timedOut = true;
//             resolve({ stdout, stderr, output, exitCode: -1, timedOut: true });
//         }, timeoutMs);

//         exec.start({ hijack: true, stdin: false }, (err, stream) => {
//             if (err || !stream) {
//                 clearTimeout(timer);
//                 resolve({
//                     stdout: "",
//                     stderr: err?.message ?? "exec failed to start",
//                     output: err?.message ?? "exec failed to start",
//                     exitCode: 1,
//                     timedOut: false,
//                 });
//                 return;
//             }

//             // Docker multiplexes stdout and stderr on the same stream
//             // modem.demuxStream separates them into two writable streams
//             sandbox.container.modem.demuxStream(
//                 stream,
//                 // stdout writable
//                 {
//                     write(chunk: Buffer) {
//                         const str = chunk.toString("utf8");
//                         stdout += str;
//                         output += str;
//                         onStdout?.(str);
//                     },
//                     end() { },
//                 } as any,
//                 // stderr writable
//                 {
//                     write(chunk: Buffer) {
//                         const str = chunk.toString("utf8");
//                         stderr += str;
//                         output += str;
//                         onStderr?.(str);
//                     },
//                     end() { },
//                 } as any,
//             );

//             stream.on("end", async () => {
//                 clearTimeout(timer);
//                 if (timedOut) return;

//                 try {
//                     const inspected = await exec.inspect();
//                     resolve({
//                         stdout: stdout.trim(),
//                         stderr: stderr.trim(),
//                         output: output.trim(),
//                         exitCode: inspected.ExitCode ?? 0,
//                         timedOut: false,
//                     });
//                 } catch {
//                     resolve({
//                         stdout: stdout.trim(),
//                         stderr: stderr.trim(),
//                         output: output.trim(),
//                         exitCode: 0,
//                         timedOut: false,
//                     });
//                 }
//             });

//             stream.on("error", (streamErr) => {
//                 clearTimeout(timer);
//                 resolve({
//                     stdout,
//                     stderr: streamErr.message,
//                     output: output + streamErr.message,
//                     exitCode: 1,
//                     timedOut: false,
//                 });
//             });
//         });
//     });
// }

export async function execInSandbox(
    workspaceId: string,
    command: string,
    opts: {
        cwd?: string;
        timeoutMs?: number;
        onStdout?: (chunk: string) => void;
        onStderr?: (chunk: string) => void;
        env?: Record<string, string>;
    } = {},
): Promise<{ output: string; exitCode: number; timedOut: boolean }> {

    const containerName = `web-ide-${workspaceId}`;
    const timeoutMs = opts.timeoutMs ?? 60_000;

    // ── cwd validation ────────────────────────────────────────────────────────
    // OCI error "Cwd must be an absolute path" = cwd was empty string or relative
    // OCI error "chdir to cwd failed: not a directory" = path exists as a FILE
    // Fix: validate cwd, fall back to /workspace if invalid
    let cwd = opts.cwd ?? "/workspace";
    if (!cwd || !cwd.startsWith("/")) {
        console.warn(
            `[Sandbox] cwd "${cwd}" is not absolute — falling back to /workspace`
        );
        cwd = "/workspace";
    }

    // Check if cwd exists as a directory inside the container
    // If not, fall back to /workspace to avoid the OCI chdir error
    const cwdCheck = await new Promise<boolean>((resolve) => {
        const check = spawn("docker", [
            "exec",
            containerName,
            "test", "-d", cwd,
        ]);
        check.on("exit", code => resolve(code === 0));
        check.on("error", () => resolve(false));
        setTimeout(() => resolve(false), 3_000);
    });

    if (!cwdCheck) {
        console.warn(
            `[Sandbox] cwd "${cwd}" does not exist in container — ` +
            `falling back to /workspace`
        );
        cwd = "/workspace";
    }

    // ── Environment variables ─────────────────────────────────────────────────
    // Always inject these so CLIs work correctly without a login shell
    // docker exec without --login doesn't source .bashrc or .profile
    const defaultEnv = {
        HOME: "/home/devuser",
        XDG_CONFIG_HOME: "/tmp/config",
        NPM_CONFIG_CACHE: "/home/devuser/.npm-cache",
        NPM_CONFIG_PREFIX: "/home/devuser/.npm-global",
        PATH: "/home/devuser/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:/usr/local/go/bin",
        ...opts.env,
    };

    const envArgs = Object.entries(defaultEnv).flatMap(
        ([k, v]) => ["--env", `${k}=${v}`]
    );

    console.log(
        `[Sandbox] exec: ${containerName} | cwd: ${cwd} | cmd: ${command}`
    );

    const args = [
        "exec",
        "--user", "devuser",
        ...envArgs,
        "--workdir", cwd,
        containerName,
        "bash", "-c", command,
    ];

    return new Promise((resolve) => {
        const proc = spawn("docker", args);
        let output = "";
        let timedOut = false;

        const timer = setTimeout(() => {
            timedOut = true;
            proc.kill("SIGTERM");
            console.warn(
                `[Sandbox] Command timed out after ${timeoutMs}ms: ${command.slice(0, 80)}`
            );
        }, timeoutMs);

        proc.stdout.on("data", (chunk: Buffer) => {
            const str = chunk.toString();
            output += str;
            opts.onStdout?.(str);
        });

        proc.stderr.on("data", (chunk: Buffer) => {
            const str = chunk.toString();
            output += str;
            opts.onStderr?.(str);
        });

        proc.on("exit", (code) => {
            clearTimeout(timer);
            const exitCode = code ?? (timedOut ? -1 : 1);
            console.log(
                `[Sandbox] exit ${exitCode} | timedOut: ${timedOut} | ` +
                `output: ${output.length} chars`
            );
            resolve({ output, exitCode, timedOut });
        });

        proc.on("error", (err) => {
            clearTimeout(timer);
            console.error(`[Sandbox] spawn error:`, err.message);
            resolve({ output: err.message, exitCode: -1, timedOut: false });
        });
    });
}

// ── Stop sandbox (sleep — container exists but not running) ───────────────────

export async function stopSandbox(workspaceId: string): Promise<void> {
    const entry = liveSandboxes.get(workspaceId);
    if (!entry) return;

    try {
        await entry.container.stop({ t: 5 });
        console.log(`[Sandbox] Stopped (sleeping): ${workspaceId}`);
    } catch (err: any) {
        // 304 = container already stopped — not an error
        if (err?.statusCode !== 304) {
            console.error(`[Sandbox] Stop error: ${workspaceId}`, err?.message);
        }
    }
    // Keep in liveSandboxes — next getOrCreateSandbox will restart it
}

// ── Destroy sandbox (remove container entirely) ───────────────────────────────

export async function destroySandbox(workspaceId: string): Promise<void> {
    const entry = liveSandboxes.get(workspaceId);

    try {
        const container = entry?.container
            ?? docker.getContainer(containerName(workspaceId));

        await container.stop({ t: 2 }).catch(() => { });
        await container.remove({ force: true });
        console.log(`[Sandbox] Destroyed: ${workspaceId}`);
    } catch (err: any) {
        if (err?.statusCode !== 404) {
            console.error(`[Sandbox] Destroy error:`, err?.message);
        }
    }

    liveSandboxes.delete(workspaceId);
}

// ── List all managed containers ───────────────────────────────────────────────

export async function listSandboxes(): Promise<Array<{
    workspaceId: string;
    containerId: string;
    running: boolean;
    lastUsed: number;
}>> {
    const containers = await docker.listContainers({
        all: true,
        filters: JSON.stringify({ label: ["web-ide.managed=true"] }),
    });

    return containers.map(c => ({
        workspaceId: c.Labels["web-ide.workspaceId"] ?? "unknown",
        containerId: c.Id.slice(0, 12),
        running: c.State === "running",
        lastUsed: liveSandboxes.get(
            c.Labels["web-ide.workspaceId"]
        )?.lastUsed ?? 0,
    }));
}

// ── Idle container cleanup ────────────────────────────────────────────────────
// Stops containers that haven't been used for IDLE_TIMEOUT_MS.
// Called on an interval from server.ts.
// Containers are stopped not destroyed — they wake instantly on next use.

export async function stopIdleContainers(): Promise<void> {
    const now = Date.now();

    for (const [workspaceId, entry] of liveSandboxes.entries()) {
        if (now - entry.lastUsed < IDLE_TIMEOUT_MS) continue;

        try {
            const info = await entry.container.inspect();
            if (!info.State.Running) continue;

            console.log(`[Sandbox] Idle timeout — stopping: ${workspaceId}`);
            await stopSandbox(workspaceId);
        } catch {
            liveSandboxes.delete(workspaceId);
        }
    }
}

// ── Verify Docker is accessible ───────────────────────────────────────────────
// Called from server.ts on startup — fails fast with clear error message

export async function verifyDocker(): Promise<void> {
    try {
        const info = await docker.info();
        console.log(
            `[Sandbox] Docker verified ✓\n` +
            `  Version:     ${info.ServerVersion}\n` +
            `  Containers:  ${info.Containers} total, ${info.ContainersRunning} running\n` +
            `  Images:      ${info.Images}\n` +
            `  Storage:     ${info.Driver}`
        );

        // Verify our image exists
        try {
            await docker.getImage(SANDBOX_IMAGE).inspect();
            console.log(`[Sandbox] Image '${SANDBOX_IMAGE}' found ✓`);
        } catch {
            throw new Error(
                `Docker image '${SANDBOX_IMAGE}' not found.\n` +
                `Run: docker build -t ${SANDBOX_IMAGE} ./docker/sandbox`
            );
        }
    } catch (err: any) {
        throw new Error(
            `[Sandbox] Cannot connect to Docker: ${err.message}\n` +
            `Make sure Docker is running: sudo systemctl start docker`
        );
    }
}