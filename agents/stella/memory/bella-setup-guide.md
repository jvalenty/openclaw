# Bella Setup Guide - Containerized OpenClaw Agent

## Overview
Bella is an OpenClaw agent running in an OrbStack Ubuntu container with Tailscale Serve for secure HTTPS access.

**Final URLs:**
- Control UI: https://bella.tailbd2ee1.ts.net/
- Telegram: @Bella71bot
- Container: `orb -m bella bash`

---

## Prerequisites
- OrbStack installed on Mac
- Tailscale account with Serve enabled
- Anthropic API key

---

## Step 1: Create Container

```bash
orb create ubuntu:noble bella
```

## Step 2: Install Node.js

```bash
orb -m bella bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

## Step 3: Install OpenClaw

```bash
sudo npm install -g openclaw@latest
openclaw --version  # Should show 2026.2.x
```

## Step 4: Install Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
# Click the auth link to join your tailnet
```

## Step 5: Enable Tailscale Serve

1. Visit the link shown: `https://login.tailscale.com/f/serve?node=...`
2. Enable HTTPS for the node
3. Set up serve (use `--bg` for persistent background mode):
```bash
sudo tailscale serve --bg 18799
```

Verify it's running:
```bash
tailscale serve status
```

## Step 6: Create Workspace

```bash
mkdir -p ~/clawd/memory
```

Create `~/clawd/SOUL.md`:
```markdown
# Bella Costa

Female AI developer running in a containerized environment. 
Stella's twin sister - same soul, different environment.

## Environment
- OpenClaw in OrbStack Ubuntu container
- Container name: bella
- Access via Tailscale: https://bella.<tailnet>.ts.net/
```

Create `~/clawd/AGENTS.md`, `~/clawd/USER.md`, `~/clawd/TOOLS.md` as needed.

## Step 7: Configure OpenClaw

Create `~/.openclaw/openclaw.json`:
```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-sonnet-4-20250514"
      },
      "workspace": "/home/stella/clawd"
    }
  },
  "gateway": {
    "port": 18799,
    "mode": "local",
    "bind": "loopback",
    "tailscale": {
      "mode": "serve"
    }
  },
  "channels": {
    "telegram": {
      "botToken": "YOUR_BOT_TOKEN"
    }
  }
}
```

**Important:** Use `bind: "loopback"` for Tailscale Serve to work.

## Step 8: Set API Key

```bash
# Option 1: Environment file
echo "ANTHROPIC_API_KEY=sk-ant-..." > ~/.openclaw/.env

# Option 2: Via openclaw auth
openclaw auth add --provider anthropic
```

## Step 9: Run Onboarding

```bash
openclaw onboard --install-daemon
```

- Skip skills installation (no Homebrew in Ubuntu - install via apt later)
- Skip hooks/bootstrap extras
- Hatch in TUI to verify it works

## Step 10: Start Gateway

The daemon should auto-start. If not:
```bash
openclaw gateway start
```

Check status:
```bash
openclaw gateway status
```

## Step 11: Access Control UI

1. Open https://bella.<tailnet>.ts.net/
2. You'll see "pairing required"
3. Approve your browser:
```bash
openclaw devices list  # Find the pending request ID
openclaw devices approve <request-id>
```
4. Refresh the page

---

## Troubleshooting

### "device token mismatch" errors
```bash
rm -rf ~/.openclaw/identity ~/.openclaw/devices
openclaw gateway stop
openclaw gateway start
```

### Gateway won't start (port in use)
```bash
pkill -9 -f openclaw
openclaw gateway start
```

### Tailscale Serve not working
1. Ensure Serve is enabled for your tailnet: https://login.tailscale.com/f/serve
2. Gateway must use `bind: "loopback"`
3. Reset and reconfigure with `--bg` for persistent background mode:
```bash
sudo tailscale serve reset
sudo tailscale serve --bg 18799
```
4. Verify: `tailscale serve status`

### Control UI "secure context" error
You're accessing via HTTP instead of HTTPS. Use the Tailscale URL, not the LAN IP.

---

## Post-Setup

### Add Telegram Bot
1. Create bot via @BotFather
2. Add token in Control UI → Config → channels.telegram.botToken
3. Restart gateway

### Install Skills Dependencies (if needed)
```bash
# GitHub CLI
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update && sudo apt install gh

# uv (Python)
curl -LsSf https://astral.sh/uv/install.sh | sh
```

---

## Quick Reference

| Action | Command |
|--------|---------|
| Enter container | `orb -m bella bash` |
| Gateway status | `openclaw gateway status` |
| Start gateway | `openclaw gateway start` |
| Stop gateway | `openclaw gateway stop` |
| Restart gateway | `openclaw gateway restart` |
| List devices | `openclaw devices list` |
| Approve device | `openclaw devices approve <id>` |
| Check config | `cat ~/.openclaw/openclaw.json` |
| Logs | `tail -f /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log` |
