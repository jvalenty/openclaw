# Claude Code Blocks — Diagnosis (2026-02-23 11:30 PM)

## Problem
Claude Code CLI can't be used reliably from OpenClaw agents. Blocks:

### Block 1: API Key Conflict
- `ANTHROPIC_API_KEY` is set in environment (by OpenClaw for its own API calls)
- Claude Code detects it and prompts: "Detected a custom API key. Do you want to use this?"
- This is an interactive prompt that blocks automated spawning
- If answered "No" (option 2), it tries OAuth which may be expired

### Block 2: OAuth Token Expiry
- Claude Code OAuth tokens expire periodically
- Need to run `claude auth login` or `/login` interactively to refresh
- Can't do this from an automated agent spawn

### Block 3: Interactive Prompts
- First-run prompts (API key, effort level) require interactive input
- Even piping `echo '2'` doesn't reliably get past all prompts
- The PTY handling is fragile

## Solutions to Test

### Option A: Unset ANTHROPIC_API_KEY for Claude Code spawns
```bash
ANTHROPIC_API_KEY= claude -p "task here"
```
This forces Claude Code to use OAuth/Max Plan instead of the API key.
Requires valid OAuth token.

### Option B: Long-lived auth token
```bash
claude setup-token
```
Creates a persistent token that doesn't expire like OAuth.
Need to check if this works with Max Plan.

### Option C: Accept the API key prompt automatically
```bash
echo '1' | claude "task"
```
Use the API key (costs money) but at least it works.
Not ideal — defeats the Max Plan cost savings.

### Option D: Claude Code config to suppress prompts
Check if there's a `~/.claude/config.json` or similar that can:
- Pre-accept the API key
- Set effort level
- Skip first-run prompts

## Findings (11:30 PM)

1. **Root cause confirmed**: `ANTHROPIC_API_KEY` in env makes Claude Code prompt interactively
2. **Fix**: `ANTHROPIC_API_KEY= claude -p "task"` — unsetting the var works, Claude Code sees Max Plan
3. **BUT**: OAuth token is expired. Need to refresh before this works.
4. **Auth status without API key**: logged in as stella@killerapps.dev, subscriptionType: "max" ✅
5. **Browser auth attempted**: Got to login page, clicked "Continue with email" but browser service timed out

## Morning Action Items (for John)

### Step 1: Refresh Claude Code OAuth on Stella's machine
```bash
# SSH to Stella's Mac Mini and run:
ANTHROPIC_API_KEY= claude auth login --email stella@killerapps.dev
# Browser will open — complete the login
```

### Step 2: Refresh on Bella's machine
```bash
# Same on Bella's Mac Mini
ANTHROPIC_API_KEY= claude auth login --email bella@killerapps.dev
```

### Step 3: Test
```bash
ANTHROPIC_API_KEY= claude -p "Say hello"
```

### Step 4: Long-lived token (prevents future expiry)
```bash
ANTHROPIC_API_KEY= claude setup-token
```

## Pattern for Spawning Claude Code from OpenClaw
```bash
# Always unset the API key so Claude Code uses Max Plan OAuth
ANTHROPIC_API_KEY= claude -p "your task prompt here"

# Or for interactive with worktrees:
cd ~/e2e/stellabot
git worktree add ../feat-xyz -b feat/xyz origin/main
ANTHROPIC_API_KEY= claude -p "Build feature XYZ. When done, commit and create PR."
```
