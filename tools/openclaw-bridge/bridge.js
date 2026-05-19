#!/usr/bin/env node
// my-workbench ⇄ OpenClaw (or any local CLI agent) bridge.
//
// Runs on your local machine. Long-polls my-workbench for queued tasks,
// shells out to your local agent CLI to execute, posts the output back.
//
// Usage:
//   node bridge.js --agent <ID> --token <TOKEN> [--base URL] [--cmd openclaw] [--args "agent --message {INPUT} --thinking low"]
//
// Env fallbacks: MWB_AGENT_ID, MWB_AGENT_TOKEN, MWB_BASE_URL, MWB_CMD, MWB_ARGS

const { spawn } = require('child_process');
const { setTimeout: delay } = require('timers/promises');

function arg(flag, fallback) {
  const i = process.argv.indexOf('--' + flag);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const AGENT_ID = arg('agent', process.env.MWB_AGENT_ID);
const TOKEN = arg('token', process.env.MWB_AGENT_TOKEN);
const BASE = (arg('base', process.env.MWB_BASE_URL) || 'https://my-workbench.onrender.com').replace(/\/$/, '');
const CMD = arg('cmd', process.env.MWB_CMD) || 'openclaw';
const ARGS_TEMPLATE = (arg('args', process.env.MWB_ARGS) || 'agent --message {INPUT} --thinking low').trim();
const POLL_WAIT_SEC = Number(arg('wait', process.env.MWB_POLL_WAIT) || 25);
const TASK_TIMEOUT_MS = Number(arg('task-timeout-ms', process.env.MWB_TASK_TIMEOUT_MS) || 5 * 60 * 1000);

if (!AGENT_ID || !TOKEN) {
  console.error('Missing --agent <ID> --token <TOKEN>. See README.');
  process.exit(1);
}

const AUTH = { Authorization: `Bearer ${TOKEN}` };

function log(...args) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[bridge ${ts}]`, ...args);
}

async function jsonFetch(url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    headers: { ...AUTH, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`${r.status} ${url}: ${t.slice(0, 200)}`);
  }
  return r.json();
}

async function heartbeat(payload) {
  try {
    await fetch(`${BASE}/api/agents/${AGENT_ID}/heartbeat`, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    log('heartbeat failed:', e.message);
  }
}

async function pollNext() {
  try {
    return await jsonFetch(`${BASE}/api/agents/${AGENT_ID}/tasks/next?wait=${POLL_WAIT_SEC}`);
  } catch (e) {
    log('poll error:', e.message);
    await delay(5000);
    return { task: null };
  }
}

function buildArgs(input) {
  // Replace {INPUT} in the args template with the actual input (as a single token)
  return ARGS_TEMPLATE.split(/\s+/).map(a => a === '{INPUT}' ? input : a);
}

function runTask(input) {
  return new Promise(resolve => {
    const args = buildArgs(input);
    log(`exec: ${CMD} ${args.map(a => (a.includes(' ') ? JSON.stringify(a) : a)).join(' ')}`);
    let proc;
    try {
      proc = spawn(CMD, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      resolve({ output: '', error: `spawn failed: ${e.message}` });
      return;
    }
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      log(`task timeout ${TASK_TIMEOUT_MS}ms — killing`);
      proc.kill('SIGTERM');
    }, TASK_TIMEOUT_MS);
    proc.stdout.on('data', d => { out += d.toString(); });
    proc.stderr.on('data', d => { err += d.toString(); });
    proc.on('error', e => {
      clearTimeout(timer);
      resolve({ output: out, error: e.message });
    });
    proc.on('close', code => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ output: out.trim() });
      } else {
        resolve({ output: out.trim(), error: (err.trim() || `exit code ${code}`).slice(0, 4000) });
      }
    });
  });
}

async function submit(taskId, output, error) {
  try {
    await fetch(`${BASE}/api/agents/tasks/${taskId}/result`, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ output, error }),
    });
  } catch (e) {
    log(`submit task #${taskId} failed:`, e.message);
  }
}

async function loop() {
  log(`bridge starting · agent=${AGENT_ID} · base=${BASE} · cmd="${CMD}"`);
  log(`args template: ${ARGS_TEMPLATE}`);
  await heartbeat({ status: 'idle', current_task: '', last_message: 'bridge connected' });

  // shut down cleanly
  let stopping = false;
  process.on('SIGINT', () => { if (stopping) process.exit(); stopping = true; log('SIGINT — finishing current task then exiting'); });
  process.on('SIGTERM', () => { if (stopping) process.exit(); stopping = true; log('SIGTERM — finishing current task then exiting'); });

  while (true) {
    if (stopping) { await heartbeat({ status: 'idle', current_task: '', last_message: 'bridge stopped' }); process.exit(0); }
    const { task } = await pollNext();
    if (!task) continue;
    log(`picked up task #${task.id}: ${String(task.input).slice(0, 80)}`);
    await heartbeat({
      status: 'running',
      current_task: String(task.input).slice(0, 200),
      last_message: `running task #${task.id}`,
    });
    const start = Date.now();
    const { output, error } = await runTask(task.input);
    const took = ((Date.now() - start) / 1000).toFixed(1);
    log(`task #${task.id} ${error ? 'ERROR' : 'done'} in ${took}s`);
    await submit(task.id, output, error);
  }
}

loop().catch(e => {
  log('fatal:', e.message);
  process.exit(1);
});
