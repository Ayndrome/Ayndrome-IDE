import Docker from 'dockerode';
import fs from 'fs';
import path from 'path';
import { getWorkspacePath, touchWorkspace, registerWorkspace, WORKSPACES_BASE_DIR } from '../workspace/local-resgistry';


const SANDBOX_IMAGE = "web-ide-sandbox:latest";
const CONTAINER_WORKSPACE = "/workspace";
const IDLE_TIMEOUT_MS = 30 * 60 * 100;
const EXEC_TIMEOUT_DEFAULT = 60_000;
const MAX_RAM_BYTES = 512 * 1024 * 1024; // 512MB
const MAX_CPU_CORES = 1_500_000_000; // 1.5 CPU Cores per container


const docker = new Docker();

type SandboxEntry = {

    workspaceId: string;
    containerId: string;
    containerName: string;
    container: Docker.Container;
    hostPath: string;
    createdAt: number;
    lastUsed: number
    isBusy?: boolean;

}


const liveSandboxes = new Map<string, SandboxEntry>();



