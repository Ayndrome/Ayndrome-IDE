# 1. Start the server
#npm run dev:server


npx tsx -e "
import { execInSandbox, getOrCreateSandbox } from './src/server/sandbox/sandbox-manager.ts';
async function test() {
  console.log('🚀 [Ayndrome] Creating sandbox...');
  try {
    await getOrCreateSandbox('test-workspace-001', 'test-project');
    const result = await execInSandbox('test-workspace-001', 'node --version');
    console.log('Result:', result);
  } catch (err) {
    console.error('Error:', err.message);
  }
}
test();
"


npx tsx -e "
import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:3000/ws/terminal?workspaceId=test-workspace-001&cols=80&rows=24');
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.type === 'ready') {
    console.log('Terminal ready — sending ls command');
    ws.send(JSON.stringify({ type: 'input', data: 'ls /workspace\r' }));
    setTimeout(() => { ws.close(); process.exit(0); }, 2000);
  }
  if (msg.type === 'output') process.stdout.write(msg.data);
});
ws.on('error', console.error);
"

npx tsx -e "
import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:3000/ws/terminal?workspaceId=test-workspace-001&cols=80&rows=24');

ws.on('open', () => console.log('[WS] Connected'));

ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'ready') {
        console.log('[WS] Terminal ready — running commands');
        setTimeout(() => ws.send(JSON.stringify({ type: 'input', data: 'node --version\r' })), 300);
        setTimeout(() => ws.send(JSON.stringify({ type: 'input', data: 'python3 --version\r' })), 800);
        setTimeout(() => ws.send(JSON.stringify({ type: 'input', data: 'gcc --version\r' })), 1300);
        setTimeout(() => ws.send(JSON.stringify({ type: 'input', data: 'ls /workspace\r' })), 1800);
        setTimeout(() => { console.log('[WS] Done'); ws.close(); process.exit(0); }, 3000);
    }
    if (msg.type === 'output') process.stdout.write(msg.data);
    if (msg.type === 'error')  console.error('[WS] Error:', msg.message);
});

ws.on('error', (err) => console.error('[WS] Connection error:', err.message));
"


docker ps | grep web-ide