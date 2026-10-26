import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Exercise Pi's persisted tool state through the shipped wrapper; synthetic data only.
const root = fileURLToPath(new URL('..', import.meta.url));
const scratch = await mkdtemp(join(root, '.build/session-tools-'));
const home = join(scratch, 'home');
await mkdir(join(home, 'agent'), { recursive: true });
let expected, requests = 0, serverError;
const server = createServer(async (req, res) => {
  try {
    let text = ''; for await (const chunk of req) text += chunk;
    const body = JSON.parse(text);
    assert.deepEqual((body.tools ?? []).map(tool => tool.function.name).sort(), [...expected].sort());
    requests++;
    const chunk = (delta, finish_reason = null) => ({
      id: 'synthetic-session', object: 'chat.completion.chunk', created: 0, model: body.model,
      choices: [{ index: 0, delta, finish_reason }],
    });
    res.writeHead(200, { 'content-type': 'text/event-stream', connection: 'close' });
    res.end(`data: ${JSON.stringify(chunk({ role: 'assistant', content: 'SESSION_TOOLS_OK' }))}\n\ndata: ${JSON.stringify(chunk({}, 'stop'))}\n\ndata: [DONE]\n\n`);
  } catch (error) { serverError = error; res.writeHead(500).end(String(error)); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
try {
  const preset = JSON.parse(await readFile(join(root, 'config/models.json'), 'utf8'));
  preset.providers['ollama-cloud'].baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  await writeFile(join(home, 'agent/models.json'), JSON.stringify(preset));
  async function run(args, tools) {
    expected = tools;
    const before = requests;
    const child = spawn(join(root, process.platform === 'linux' ? 'dist/pi-response-linux-x64' : 'dist/pi-response.exe'), [...args, '-p', 'Check synthetic session tools.'], {
      cwd: scratch, env: { ...process.env, PI_RESPONSE_HOME: home, OLLAMA_API_KEY: 'synthetic-key' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    const code = await new Promise((done, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error('Session tools smoke timed out')); }, 40000);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('exit', code => { clearTimeout(timer); done(code); });
    });
    if (serverError) throw serverError;
    assert.equal(code, 0, output);
    assert.match(output, /SESSION_TOOLS_OK/);
    assert.equal(requests, before + 1);
  }
  await run(['--tools', 'read,ls,web_search,url_context'], ['read', 'ls']);
  const files = await readdir(join(home, 'sessions'), { recursive: true });
  const session = join(home, 'sessions', files.find(file => file.endsWith('.jsonl')));
  const sessionId = JSON.parse((await readFile(session, 'utf8')).split('\n')[0]).id;
  await run(['--continue'], ['read', 'ls']);
  await run(['--session-id', sessionId], ['read', 'ls']);
  const older = join(scratch, 'older-session.jsonl');
  await writeFile(older, await readFile(session));
  await run(['--session', session, '--tools', '+grep,-ls'], ['read', 'grep']);
  await run(['--fork', session], ['read', 'grep']);
  await run(['--session', session, '--tools', 'read'], ['read']);
  await run(['--session', session, '--no-tools'], []);
  // Introduce an extension after the session recorded its original loadout.
  const extension = join(scratch, 'new-tools.mjs');
  await writeFile(extension, `export default function(pi) {
    for (const [name, defaultActive] of [['new_active', true], ['new_inactive', false]]) {
      pi.registerTool({ name, label: name, description: 'Synthetic regression tool', defaultActive,
        parameters: { type: 'object', properties: {} },
        execute: async () => ({ content: [{ type: 'text', text: 'synthetic' }], details: {} }) });
    }
  }`);
  await run(['--fork', older, '--extension', extension], ['read', 'ls', 'new_active']);
  await run(['--fork', older, '--extension', extension, '--tools', 'read'], ['read']);
  console.log('PASS: resumed and forked tools, relative adjustments, explicit allowlist/no-tools, web off after resume.');
} finally {
  await new Promise(done => server.close(done));
}
