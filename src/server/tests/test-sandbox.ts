import { execInSandbox, getOrCreateSandbox } from '../sandbox/sandbox-manager';

async function runTest() {
    const testWsId = 'test-workspace-001';

    console.log('[Ayndrome-IDE] Starting Sandbox Test...');

    try {
        // 1. Initialize the sandbox
        console.log(`[1/2] Provisioning sandbox for: ${testWsId}`);
        await getOrCreateSandbox(testWsId, 'test-project');

        // 2. Execute a command inside
        console.log(`[2/2] Executing "node --version" inside container...`);
        const result = await execInSandbox(testWsId, 'node --version');

        console.log('\nTEST SUCCESSFUL');
        console.log('Container Output:', result);

    } catch (error) {
        console.error('\nTEST FAILED');
        console.error('Error details:', error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

runTest();