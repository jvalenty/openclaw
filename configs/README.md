# OpenClaw Config Management

Central config template for all agents. **Do not edit individual `openclaw.json` files directly.**

## Files

| File | Purpose |
|------|---------|
| `template.json5` | Shared config template with `${VAR}` placeholders |
| `agents.json` | Per-agent variables (IDs, names, paths) |
| `generate-config.sh` | Generates final config from template + agent vars |

## Usage

```bash
# Preview config for an agent
./configs/generate-config.sh bella

# Apply config (backs up existing, writes to ~/.openclaw/openclaw.json)
./configs/generate-config.sh bella --apply

# Then restart
openclaw gateway restart
```

## Making Changes

1. Edit `template.json5` for shared settings (compaction, pruning, channels, etc.)
2. Edit `agents.json` for per-agent values (workspace path, model, identity)
3. Run `generate-config.sh <agent> --apply` on each machine
4. Commit and push

## Secrets

Tokens in `agents.json` are placeholders. Actual secrets are managed via OpenClaw UI Vars.
The template uses `${VAR_NAME}` references that OpenClaw resolves at runtime from:
1. UI Vars (preferred — John manages via dashboard)
2. `~/.openclaw/.env` file
3. Process environment

## Version History

- **2026-02-22**: Initial template with compaction, memory flush, context pruning, Slack config
