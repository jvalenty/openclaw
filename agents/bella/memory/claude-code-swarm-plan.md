# Claude Code Agent Swarm Setup Plan

## Goal
Switch from expensive direct API coding ($200+/day) to orchestrated Claude Code/Codex agent swarms ($200-300/month).

## Current Blockers (to solve)
1. **Claude Code CLI not installed on Bella's machine** — need to install
   - Stella HAS it installed already
   - Install: `brew install --cask claude-code` or `curl -fsSL https://claude.ai/install.sh | bash`
2. **OAuth token expiry** — ROOT BLOCKER. Claude Code's OAuth keeps expiring on Stella's machine
   - When ANTHROPIC_API_KEY env var is set (by OpenClaw), Claude Code uses API key (expensive!)
   - When unset, it sees Max Plan subscription (cheap!) but OAuth expires
   - Fix: `unset ANTHROPIC_API_KEY` before spawning agents, and fix OAuth refresh
   - May need `claude login` to get a fresh long-lived token
3. **No Codex CLI installed** — `npm install -g @openai/codex` or similar
4. **RAM** — Bella's Mac Mini: 24GB (good, 5-6 agents). Need to check Stella's.
5. **Git worktree workflow** not set up

## Implementation Steps

### Phase 1: Infrastructure (30 min)
1. Install Claude Code CLI on both machines
2. Install Codex CLI on both machines  
3. Set up authentication (Max plan or API key)
4. Check RAM on both machines: `sysctl hw.memorysize`
5. Verify `git worktree` works with stellabot repo

### Phase 2: Task Registry + Scripts (1 hour)
1. Create `.openclaw/active-tasks.json` registry format
2. Create spawn script: `scripts/spawn-agent.sh <task-id> <branch> <agent-type> <prompt>`
   - Creates git worktree
   - Starts tmux session
   - Launches Claude Code or Codex with prompt
   - Registers in task JSON
3. Create monitor script: `scripts/check-agents.sh`
   - Checks tmux sessions alive
   - Checks for open PRs on tracked branches
   - Checks CI status via `gh`
   - Reports to orchestrator
4. Create cleanup script: `scripts/cleanup-worktrees.sh`

### Phase 3: OpenClaw Integration (1 hour)
1. Use `sessions_spawn` or `exec` with tmux to launch agents
2. Set up cron job to run check-agents.sh every 10 min
3. Orchestrator (Bella/Stella) spawns agents from task queue
4. Orchestrator reviews PRs when notified

### Phase 4: Code Review Pipeline
1. Set up Gemini Code Assist on GitHub (free)
2. Configure Claude Code as PR reviewer
3. Define "definition of done" checklist
4. Auto-notify orchestrator when all checks pass

## Role Split for Swarm
- **Stella (Architect/Opus):** Reviews PRs, approves merges, deploys
- **Bella (Developer/Sonnet):** Orchestrates coding agents, writes prompts, monitors progress
- **Claude Code agents (Max plan):** Execute coding tasks in isolated worktrees
- **Codex agents ($20-90/month):** Backend-heavy tasks

## Cost Comparison
| Item | Current | Target |
|------|---------|--------|
| Bella (Opus API) | ~$100/day | $0 (move to Sonnet for orchestration only) |
| Stella (Opus API) | ~$100/day | ~$30/day (architect reviews only, less volume) |
| Claude Code Max | $0 | $200/month |
| Codex | $0 | $20-90/month |
| **Total** | **~$6,000/month** | **~$1,200/month** |
