import fs from 'fs/promises';
import path from 'path';


const WORKSPACE_DIR = path.join(process.cwd(), 'workspaces');
const WORKSPACE_REGISTRY_FILE = path.join(WORKSPACE_DIR, 'registry.json');

type registry = {
    [key: string]: {

    }
}

export async function getWorkspaceId() {
    try {
        // TODO: implement workspace ID lookup
        return undefined;
    } catch {
        return undefined;
    }
}
