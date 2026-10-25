// Packaged Pi 1.4.0 compaction against a synthetic internal-compatible endpoint.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const home = await mkdtemp(join(root, '.build/compaction-'));
await mkdir(join(home, 'agent'));
let phase = 'seed', requests = 0, summaryRequests = 0, failure;
const server = createServer(async (req, res) => {
  try {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    assert.equal(req.url, '/v1/chat/completions');
    assert.equal(req.headers.authorization, 'Bearer synthetic-internal-key');
    assert.equal(body.model, 'internal-model');
    assert.ok(body.max_tokens > 0 && body.max_tokens <= 1024, JSON.stringify(body));
    if (phase === 'compact') {
      summaryRequests++;
      // reserveTokens=64 must no longer impose the old 0.8*reserve cap.
      assert.ok(body.max_tokens > 64);
      assert.match(raw, /PRESERVE_SYNTHETIC_MARKER/);
    }
    requests++;
    const text = phase === 'compact' ? '# Summary\nSynthetic context preserved.' : phase === 'resume' ? 'CONTINUED_OK' : 'Synthetic response. '.repeat(100);
    const event = (delta, finish_reason = null) => JSON.stringify({ id: 'compaction', object: 'chat.completion.chunk', created: 0, model: body.model, choices: [{ index: 0, delta, finish_reason }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(`data: ${event({ role: 'assistant', content: text })}\n\ndata: ${event({}, 'stop')}\n\ndata: [DONE]\n\n`);
  } catch (error) { failure = error; res.writeHead(500).end(String(error)); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
await writeFile(join(home, 'agent/models.json'), JSON.stringify({ providers: { 'internal-test': {
  baseUrl: `http://127.0.0.1:${server.address().port}/v1`, api: 'openai-completions', apiKey: '${PI_RESPONSE_TEST_API_KEY}', authHeader: true,
  compat: { supportsStore: false, supportsDeveloperRole: false, maxTokensField: 'max_tokens' },
  models: [{ id: 'internal-model', name: 'Synthetic internal model', reasoning: false, input: ['text'], contextWindow: 64000, maxTokens: 1024 }],
} } }));
await writeFile(join(home, 'agent/settings.json'), JSON.stringify({ compaction: { enabled: false, reserveTokens: 64, keepRecentTokens: 64 } }));
const child = spawn(join(root, 'dist', process.platform === 'win32' ? 'pi-response.exe' : 'pi-response-linux-x64'), ['--provider', 'internal-test', '--model', 'internal-model', '--mode', 'rpc', '--no-session', '--tools', 'read'], {
  env: { ...process.env, PI_RESPONSE_HOME: home, PI_RESPONSE_TEST_API_KEY: 'synthetic-internal-key', OLLAMA_API_KEY: '' }, stdio: ['pipe', 'pipe', 'pipe'],
});
let buffer = '', stderr = '', sequence = 0;
const events = [], waiters = [];
const wait = (predicate, start = 0) => new Promise((resolveWait, reject) => {
  const old = events.slice(start).find(predicate);
  if (old) return resolveWait(old);
  const entry = { predicate, resolveWait, timer: setTimeout(() => reject(new Error(`RPC timeout: ${stderr}`)), 45000) };
  waiters.push(entry);
});
child.stdout.on('data', chunk => {
  buffer += chunk;
  let end;
  while ((end = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
    if (!line) continue;
    try {
      const event = JSON.parse(line); events.push(event);
      for (const entry of [...waiters]) if (entry.predicate(event)) {
        clearTimeout(entry.timer); waiters.splice(waiters.indexOf(entry), 1); entry.resolveWait(event);
      }
    } catch (error) { failure = error; }
  }
});
child.stderr.on('data', chunk => { stderr += chunk; });
child.on('error', error => { failure = error; });
async function command(type, values = {}) {
  const id = `command-${++sequence}`;
  child.stdin.write(JSON.stringify({ type, id, ...values }) + '\n');
  const response = await wait(event => event.type === 'response' && event.id === id);
  if (failure) throw failure;
  assert.ok(response.success, JSON.stringify(response));
  return response;
}
async function prompt(message) {
  const start = events.length;
  await command('prompt', { message });
  await wait(event => event.type === 'agent_end', start);
  if (failure) throw failure;
}
try {
  await prompt('Synthetic history. '.repeat(150));
  await prompt('More synthetic history. '.repeat(150));
  phase = 'compact';
  await command('compact', { customInstructions: 'PRESERVE_SYNTHETIC_MARKER' });
  assert.ok(summaryRequests > 0);
  phase = 'resume';
  await prompt('Continue after compaction.');
  assert.match(JSON.stringify(events), /CONTINUED_OK/);
  assert.ok(requests >= 4);
  console.log('PASS: custom-provider compaction uses model output budget, honors instructions, and continues successfully.');
} finally {
  child.stdin.end(); child.kill();
  for (const entry of waiters) clearTimeout(entry.timer);
  server.closeAllConnections(); await new Promise(done => server.close(done));
}
