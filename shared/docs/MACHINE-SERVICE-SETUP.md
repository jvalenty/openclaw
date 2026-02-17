# Stellabot Machine Service — Setup Guide

> Last updated: 2026-02-12

Complete setup instructions for the Stellabot Machine Service on a new machine.

**Note:** Machine Service is for **hardware-only** operations. File storage uses R2 cloud storage via Stellabot `/api/cloud-storage`.

---

## Prerequisites

- macOS or Linux
- Node.js 20+
- Tailscale installed and connected to your tailnet
- Access to Stellabot Fly secrets

---

## 1. Clone & Install

```bash
# Clone repository (or copy from existing machine)
cd ~/clawd
git clone https://github.com/jvalenty/stellabot-machine-service.git
cd stellabot-machine-service

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install
```

---

## 2. Configure

### Create config file

```bash
cp config.example.json config.json
```

### Edit config.json

```json
{
  "port": 18900,
  "host": "YOUR_TAILSCALE_IP",
  "auth": {
    "token": "generate-secure-token-here"
  },
  "browser": {
    "defaultProfile": "default",
    "profiles": {
      "default": {
        "userDataDir": "/Users/YOUR_USER/.stellabot-machine/browser-data",
        "headless": false
      }
    },
    "orgProfilesDir": "/Users/YOUR_USER/.stellabot-machine/browser-profiles"
  },
  "pool": {
    "maxPages": 10,
    "maxPagesPerOrg": 5,
    "maxPagesPerAgent": 10
  },
  "machine": {
    "name": "YOUR_MACHINE_NAME",
    "capabilities": ["browser", "exec", "files", "screen", "camera"],
    "stellabotUrl": "https://stellabot.app",
    "stellabotToken": "YOUR_STELLABOT_MACHINE_TOKEN",
    "heartbeatIntervalMs": 60000
  },
  "exec": {
    "allowedCommands": ["*"],
    "blockedCommands": ["rm -rf /", "shutdown", "reboot"],
    "maxTimeout": 300000,
    "defaultCwd": "/Users/YOUR_USER"
  },
  "files": {
    "basePaths": ["/Users/YOUR_USER", "/tmp"],
    "maxFileSize": 10485760
  },
  "logging": {
    "level": "info",
    "auditFile": "/Users/YOUR_USER/.stellabot-machine/audit.log"
  }
}
```

### Configuration Notes

| Field | Description |
|-------|-------------|
| `pool.maxPagesPerAgent` | Max browser tabs per agent (isolated sessions) |
| `files.basePaths` | Allowed directories for local file operations |
| `files.maxFileSize` | Max file size in bytes (default 10MB) |

### Get your Tailscale IP

```bash
tailscale ip -4
# Example output: 100.74.241.116
```

Use this IP for the `host` field.

### Generate auth token

```bash
openssl rand -hex 24
# Example: 17fe841e4f05323acd0704a60aa15dfa459f8c9f79348ce7
```

---

## 3. Create directories

```bash
mkdir -p ~/.stellabot-machine/browser-data
mkdir -p ~/.stellabot-machine/browser-profiles
```

---

## 4. Build & Test

```bash
# Build TypeScript
npm run build

# Run in foreground to test
npm start

# In another terminal, test health endpoint
curl http://YOUR_TAILSCALE_IP:18900/health
```

Expected output:
```json
{"ok":true,"version":"1.0.0","uptime":1,"capabilities":["browser","exec","screen","camera"]}
```

---

## 5. Install as Service

### macOS (launchd)

Create plist file:

```bash
cat > ~/Library/LaunchAgents/com.stellabot.machine-service.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.stellabot.machine-service</string>
    
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/YOUR_USER/clawd/stellabot-machine-service/dist/index.js</string>
    </array>
    
    <key>WorkingDirectory</key>
    <string>/Users/YOUR_USER/clawd/stellabot-machine-service</string>
    
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>/Users/YOUR_USER</string>
    </dict>
    
    <key>RunAtLoad</key>
    <true/>
    
    <key>KeepAlive</key>
    <true/>
    
    <key>StandardOutPath</key>
    <string>/Users/YOUR_USER/.stellabot-machine/stdout.log</string>
    
    <key>StandardErrorPath</key>
    <string>/Users/YOUR_USER/.stellabot-machine/stderr.log</string>
</dict>
</plist>
EOF
```

**Important:** Replace `/usr/local/bin/node` with your actual node path (`which node`).

Load and start:

```bash
launchctl load ~/Library/LaunchAgents/com.stellabot.machine-service.plist
```

Verify:

```bash
launchctl list | grep stellabot
curl http://YOUR_TAILSCALE_IP:18900/health
```

### Linux (systemd)

```bash
sudo cat > /etc/systemd/system/stellabot-machine.service << 'EOF'
[Unit]
Description=Stellabot Machine Service
After=network.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/home/YOUR_USER/stellabot-machine-service
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=HOME=/home/YOUR_USER

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable stellabot-machine
sudo systemctl start stellabot-machine
```

---

## 6. Configure Stellabot

### Set Fly secrets

```bash
fly secrets set MACHINE_SERVICE_URL=http://YOUR_TAILSCALE_IP:18900 --app stellabot-app
fly secrets set MACHINE_SERVICE_TOKEN=YOUR_AUTH_TOKEN --app stellabot-app
```

### Deploy Stellabot

```bash
cd ~/clawd/stellabot-replit
fly deploy --app stellabot-app
```

---

## 7. Verify End-to-End

### From Fly machine

```bash
fly ssh console --app stellabot-app
curl -H "Authorization: Bearer $MACHINE_SERVICE_TOKEN" http://100.74.241.116:18900/health
```

### Test browser navigation

```bash
curl -X POST http://YOUR_TAILSCALE_IP:18900/browser/navigate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

---

## Capabilities

| Category | Endpoints | Purpose |
|----------|-----------|---------|
| **Browser** | `/browser/*` | Playwright automation |
| **Exec** | `/exec` | Shell command execution |
| **Screen** | `/screen/*` | Screen capture/record |
| **Camera** | `/camera/*` | Camera access |

### What's NOT in Machine Service

- **File storage** — Use Stellabot `/api/cloud-storage` (R2)
- **Database access** — Use Stellabot API
- **Google APIs** — Use Stellabot soft agent tools

---

## Security Checklist

- [ ] Auth token is unique and secure (24+ random bytes)
- [ ] `host` is set to Tailscale IP (not 0.0.0.0)
- [ ] Only Tailscale devices can reach port 18900
- [ ] `blockedCommands` includes dangerous commands
- [ ] Fly secrets are set (not hardcoded)

---

## Service Management

### macOS

```bash
# Start
launchctl load ~/Library/LaunchAgents/com.stellabot.machine-service.plist

# Stop
launchctl unload ~/Library/LaunchAgents/com.stellabot.machine-service.plist

# Restart (stop + start)
launchctl unload ~/Library/LaunchAgents/com.stellabot.machine-service.plist
launchctl load ~/Library/LaunchAgents/com.stellabot.machine-service.plist

# Status
launchctl list | grep stellabot
```

### Linux

```bash
sudo systemctl start stellabot-machine
sudo systemctl stop stellabot-machine
sudo systemctl restart stellabot-machine
sudo systemctl status stellabot-machine
```

---

## Logs

```bash
# Audit log (all API calls)
tail -f ~/.stellabot-machine/audit.log

# Service stdout (macOS)
tail -f ~/.stellabot-machine/stdout.log

# Service stderr (macOS)
tail -f ~/.stellabot-machine/stderr.log

# Systemd logs (Linux)
journalctl -u stellabot-machine -f
```

---

## Troubleshooting

### Service won't start

```bash
# Check node path
which node
# Update plist ProgramArguments with correct path

# Check permissions
ls -la ~/clawd/stellabot-machine-service/dist/

# Run manually to see errors
cd ~/clawd/stellabot-machine-service
node dist/index.js
```

### Connection refused

```bash
# Check if listening
netstat -an | grep 18900

# Check Tailscale
tailscale status

# Test locally first
curl http://127.0.0.1:18900/health  # Should fail (bound to Tailscale)
curl http://YOUR_TAILSCALE_IP:18900/health  # Should work
```

### Browser errors

```bash
# Reinstall Playwright
cd ~/clawd/stellabot-machine-service
npx playwright install

# Check browser data directory exists
ls -la ~/.stellabot-machine/browser-data/

# Try headless mode
# Edit config.json: "headless": true
```

### Auth failures

```bash
# Check token matches
cat config.json | grep token

# Test with correct header
curl -H "Authorization: Bearer YOUR_EXACT_TOKEN" http://IP:18900/status
```

---

## Current Mac Mini Setup

| Setting | Value |
|---------|-------|
| Host | `100.74.241.116` |
| Port | `18900` |
| User | `stella` |
| Code | `~/clawd/stellabot-machine-service/` |
| Config | `~/clawd/stellabot-machine-service/config.json` |
| Service | `~/Library/LaunchAgents/com.stellabot.machine-service.plist` |
| Logs | `~/.stellabot-machine/audit.log` |
| Capabilities | browser, exec, screen, camera |
