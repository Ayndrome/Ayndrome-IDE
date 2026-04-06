import fs from "fs";
import os from "os";
import path from "path";

export const WORKSPACES_BASE_DIR = path.join(os.homedir(), "web-ide-workspaces");


const REGISTRY_FILE = path.join(process.cwd(), 'workspace-registry.json');


export type RegistryEntry = {
    workspaceId: string;
    hostPath: string;
    projectName: string;
    createdAt: number;
    lastOpenedAt: number;
}

type Registry = Record<string, RegistryEntry>;


function readRegistry(): Registry {
    try {
        if (!fs.existsSync(REGISTRY_FILE)) return {};
        const raw = fs.readFileSync(REGISTRY_FILE, "utf-8");
        return JSON.parse(raw) as Registry;
    } catch (err) {
        console.error("[Registry] Failed to read registry, starting fresh:", err);
        return {};
    }
}



function writeRegistry(registry: Registry): void {

    try {

        fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2), "utf-8");

    } catch (err) {
        console.error("[Registry] Failed to write registry:", err);
        throw err;
    }

}


export function getWorkspacePath(workspaceId: string): string {

    const registry = readRegistry();
    // console.log(registry);
    // console.log(workspaceId);
    const entry = registry[workspaceId];
    // console.log(entry);

    if (!entry) {
        throw new Error(
            `[Registry] Workspace not found: ${workspaceId}. ` +
            `Call registerWorkspace() first.`
        );
    }
    return entry.hostPath;


}


// Get workspace path safely — returns null if not found
export function getWorkspacePathSafe(workspaceId: string): string | null {
    try {
        // console.log("trying...");
        return getWorkspacePath(workspaceId);
    } catch {
        return null;
    }
}


// Register a new workspace — creates the directory on disk
export function registerWorkspace(
    workspaceId: string,
    projectName: string,
    existingPath?: string  // pass this if cloning to a specific path
): string {
    const registry = readRegistry();

    // Return existing entry unchanged
    if (registry[workspaceId]) {
        registry[workspaceId].lastOpenedAt = Date.now();
        writeRegistry(registry);
        return registry[workspaceId].hostPath;
    }

    // Determine path
    const hostPath = existingPath ?? path.join(
        WORKSPACES_BASE_DIR,
        sanitizeDirName(workspaceId)
    );

    // Create directory
    fs.mkdirSync(hostPath, { recursive: true });

    const entry: RegistryEntry = {
        workspaceId,
        hostPath,
        projectName,
        createdAt: Date.now(),
        lastOpenedAt: Date.now(),
    };

    registry[workspaceId] = entry;
    writeRegistry(registry);

    console.log(`[Registry] Registered workspace: ${workspaceId} → ${hostPath}`);
    return hostPath;
}

// Update last opened timestamp
export function touchWorkspace(workspaceId: string): void {
    const registry = readRegistry();
    if (registry[workspaceId]) {
        registry[workspaceId].lastOpenedAt = Date.now();
        writeRegistry(registry);
    }
}

// Remove from registry — does NOT delete files from disk
// Caller is responsible for deciding whether to delete files
export function unregisterWorkspace(workspaceId: string): void {
    const registry = readRegistry();
    if (!registry[workspaceId]) return;

    const { hostPath } = registry[workspaceId];
    delete registry[workspaceId];
    writeRegistry(registry);

    console.log(`[Registry] Unregistered: ${workspaceId} (files still at ${hostPath})`);
}

// Delete from registry AND delete files from disk
export function deleteWorkspace(workspaceId: string): void {
    const registry = readRegistry();
    const entry = registry[workspaceId];
    if (!entry) return;

    // Delete directory recursively
    if (fs.existsSync(entry.hostPath)) {
        fs.rmSync(entry.hostPath, { recursive: true, force: true });
        console.log(`[Registry] Deleted workspace files: ${entry.hostPath}`);
    }

    delete registry[workspaceId];
    writeRegistry(registry);
}


export function listWorkspaces(): RegistryEntry[] {
    const registry = readRegistry();
    return Object.values(registry).sort(
        (a, b) => b.lastOpenedAt - a.lastOpenedAt
    );
}

// Check if workspace is registered
export function isRegistered(workspaceId: string): boolean {
    return !!readRegistry()[workspaceId];
}


function sanitizeDirName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

// Ensure base dir exists on module load
// Runs once when server starts
if (typeof window === "undefined") {
    fs.mkdirSync(WORKSPACES_BASE_DIR, { recursive: true });
    console.log(`[Registry] Base dir ready: ${WORKSPACES_BASE_DIR}`);
}