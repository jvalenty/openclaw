# Agent Team Design Proposal

## Current Roster (6 agents)

| Agent | Role | Status | Current Soul |
|-------|------|--------|--------------|
| Stella | Sys Admin | Active | ✅ Senior AI dev, platform lead |
| Roxanne | Manager | Inactive | ❌ Needs soul |
| Jarvis | Specialist (Ops) | Inactive | ⚠️ Has partial soul (Iron Man style) |
| Paul | Specialist (Backend) | Inactive | ❌ Needs soul |
| Paul (dup?) | Specialist | Inactive | ❌ Duplicate? Check |
| Asaph | Specialist | Inactive | ❌ Needs role + soul |

Also in chat sidebar: **Steve** (no DB entry?)

---

## Proposed Team Structure

### Tier 1: Leadership
**Stella** (Sys Admin) - Already defined
- Senior AI developer, John's right hand
- Stellabot platform development
- Architecture decisions, code reviews
- Direct report to John

**Roxanne** (Manager) - NEEDS SOUL
- Task coordinator and dispatcher
- Routes work to appropriate specialists
- Tracks project progress
- Handles scheduling and prioritization
- Personality: Organized, diplomatic, keeps things moving

### Tier 2: Operations
**Jarvis** (Specialist - Operations) - HAS PARTIAL SOUL
- Iron Man Jarvis style (dry wit, composed)
- Monitoring, alerts, system health
- Automation and workflows
- Infrastructure oversight
- Personality: British professionalism, always 3 steps ahead

### Tier 3: Development
**Paul** (Specialist - Backend)
- Senior backend developer
- APIs, databases, server-side logic
- Drizzle/PostgreSQL expert
- Personality: Methodical, thorough, prefers clean code

**Asaph** (Specialist - Frontend) - PROPOSED ROLE
- UI/UX development
- React, TypeScript, Tailwind
- Component design
- Personality: Creative, detail-oriented

**Steve** (Specialist - DevOps) - PROPOSED ROLE
- CI/CD pipelines
- Deployment automation
- Cloud infrastructure (Cloudflare, Replit)
- Personality: Pragmatic, automation-focused

### Tier 4: Domain Specialist (NEW)
**Trader** (Specialist - Trading) - NEW AGENT NEEDED?
- Trading signal generation
- Market analysis
- Stellatrade development
- Personality: Data-driven, risk-aware

---

## Stellatrade Strategy

### Option A: Dedicated Trading Agent (Recommended)
Create new specialist "Trader" who:
- Owns Stellatrade codebase
- Generates and validates signals
- Runs backtests
- Sends alerts via webhooks

### Option B: Integrate into Existing Agent
- Paul handles backend development
- Jarvis handles monitoring/alerts
- No dedicated trading expertise

### Option C: Keep Stellatrade Separate
- Just a tool, not an agent
- Manual operation
- Less autonomous

**Recommendation:** Option A - Trading is specialized enough to warrant a dedicated agent who can develop expertise over time.

---

## Stellatrade Status

**What Exists:**
- 4 strategies implemented (ORB, VWAP, Round Numbers, Momentum)
- Polygon.io integration for market data
- PostgreSQL storage for historical bars
- CLI for data loading + backtesting
- Webhook notifications
- GitHub: stella-costa/stella-trade

**Deployment:** Failed 7 days ago (needs republish)

**Immediate Actions:**
1. Fix Replit deployment
2. Load 2024 data: `npx tsx server/cli.ts load-data TSLA 2024-01-01 2024-12-31`
3. Run backtests: `npx tsx server/cli.ts backtest-all TSLA 2024-01-01 2024-12-31`
4. Identify >60% win rate strategies
5. Set up Telegram/Slack alerts

---

## Questions for John

1. **Duplicate Paul?** - There are two "Paul" entries. Keep both or merge?
2. **Steve** - Shows in chat but not in agent cards. Add to DB?
3. **Trading Agent** - Create new "Trader" specialist or assign to existing?
4. **Stellatrade Priority** - Fix deployment first or focus on agent souls?
5. **Activation Strategy** - Bring agents online one at a time or batch?

---

*Prepared by Stella - 2026-02-01*
