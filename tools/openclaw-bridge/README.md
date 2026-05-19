# openclaw-bridge

Tiny local bridge that pulls queued tasks from my-workbench and runs them through your local CLI agent (default: [OpenClaw](https://github.com/openclaw/openclaw)), then submits the output back.

**No inbound connectivity needed** — only outbound HTTPS from your machine to my-workbench. Your OpenClaw Gateway stays local.

## How it works

```
my-workbench  ──long-poll──▶  bridge.js  ──spawn──▶  openclaw agent --message "..."
   (Render)   ◀──result POST──            ◀──stdout──
```

1. You enqueue a task from the web UI: `POST /api/agents/:id/tasks { input }`.
2. `bridge.js` is long-polling `GET /api/agents/:id/tasks/next?wait=25`. Server holds the request until a task is queued (or 25s timeout) and returns one task.
3. Bridge spawns your local CLI: `openclaw agent --message "<the input>" --thinking low`.
4. When the process exits, bridge POSTs `{ output, error }` to `/api/agents/tasks/<id>/result`.
5. Server flips the task to `done` / `error` and updates the parent Agent's `status` + `last_heartbeat_at`.

While idle, bridge keeps polling (one open request at a time, the request itself acts as a heartbeat).

## Setup

You need Node 20+ (Node 24 if you're running OpenClaw natively).

```bash
git clone https://github.com/choijun511/my-workbench.git   # if you haven't already
cd my-workbench/tools/openclaw-bridge

# No deps to install (uses built-in fetch + child_process)
```

Get **Agent ID** and **Token** from my-workbench:
1. Open https://my-workbench.onrender.com/agents
2. Click "接入 Agent", create one (e.g. name "OpenClaw 本地")
3. In the detail page, click "查看" next to Token to reveal it
4. Copy the one-line command from "一行启动 Bridge"

Run it:

```bash
node bridge.js \
  --agent 3 \
  --token agt_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --base https://my-workbench.onrender.com
```

You should see:

```
[bridge HH:MM:SS] bridge starting · agent=3 · base=https://my-workbench.onrender.com · cmd="openclaw"
[bridge HH:MM:SS] args template: agent --message {INPUT} --thinking low
```

Now enqueue a task from the web UI — bridge picks it up within seconds.

## Flags

| Flag | Env var | Default | Notes |
|------|---------|---------|-------|
| `--agent <id>` | `MWB_AGENT_ID` | (required) | Agent ID in my-workbench |
| `--token <token>` | `MWB_AGENT_TOKEN` | (required) | Token shown in the Agent detail page |
| `--base <url>` | `MWB_BASE_URL` | `https://my-workbench.onrender.com` | my-workbench origin |
| `--cmd <bin>` | `MWB_CMD` | `openclaw` | The local CLI to spawn. Swap in any CLI; e.g. `python`, `ollama`, `gh copilot` |
| `--args "<template>"` | `MWB_ARGS` | `agent --message {INPUT} --thinking low` | Arg template; `{INPUT}` is replaced with the task's input as a single argv token |
| `--wait <sec>` | `MWB_POLL_WAIT` | `25` | Long-poll window |
| `--task-timeout-ms <ms>` | `MWB_TASK_TIMEOUT_MS` | `300000` | Kills the spawned process after this many ms |

### Examples

**Use with OpenCode instead of OpenClaw:**
```bash
node bridge.js --agent 4 --token agt_... \
  --cmd opencode --args "run {INPUT}"
```

**Use with a Python script of your own:**
```bash
node bridge.js --agent 5 --token agt_... \
  --cmd python --args "/Users/me/scripts/process.py {INPUT}"
```

**Pipe input via stdin instead of argv** (not yet supported — open an issue if you need it).

## Run it always (mac launchd)

`~/Library/LaunchAgents/local.mwb.openclaw-bridge.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>          <string>local.mwb.openclaw-bridge</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/YOU/my-workbench/tools/openclaw-bridge/bridge.js</string>
    <string>--agent</string><string>3</string>
    <string>--token</string><string>agt_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</string>
  </array>
  <key>RunAtLoad</key>      <true/>
  <key>KeepAlive</key>      <true/>
  <key>StandardOutPath</key><string>/tmp/openclaw-bridge.log</string>
  <key>StandardErrorPath</key><string>/tmp/openclaw-bridge.log</string>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/local.mwb.openclaw-bridge.plist
```

## Security notes

- Token is a shared secret. Don't commit it. Don't paste it on Discord. Treat it like a password.
- If you suspect it leaked, click "重新生成" in the Agent detail page. Old bridge instances will start getting 401s.
- The bridge runs whatever shell command you point `--cmd` at, with input from the web. Only use it for agents you actually want to give web-trigger access to.
- For multi-user my-workbench setups, anyone who can see the UI can enqueue tasks. The token only protects the `next` and `result` endpoints (so a stranger can't masquerade as your agent).
