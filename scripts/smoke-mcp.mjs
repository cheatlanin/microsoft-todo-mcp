import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// No sign-in and no Graph calls. Check the actual built server and read-only tool surface.
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('../dist/index.js', import.meta.url)), '--readonly', '--scope-readonly'],
  env: Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined)),
  stderr: 'pipe',
});
const client = new Client({ name: 'todo-mcp-local-smoke', version: '1.0.0' });
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.ok(tools.some(tool => tool.name === 'list_tasks'));
  assert.ok(tools.every(tool => !/^(create|update|delete|complete|add)_/.test(tool.name)));
  const status = await client.callTool({ name: 'auth_status', arguments: {} });
  assert.ok(!status.isError);
  process.stdout.write(JSON.stringify({ connected: true, tools: tools.map(tool => tool.name), status }, null, 2) + '\n');
} finally {
  await client.close();
}
