# Cost Controls & Model Management

**Status:** Specification  
**Author:** Stella Costa  
**Date:** 2026-02-18  
**Version:** 1.0

---

## Overview

This specification defines a comprehensive system for managing AI model costs across the Stellabot platform. It introduces three-layer cost controls (System → Org → Agent), intelligent model routing based on task complexity, and administrative tools for monitoring and managing usage.

---

## Goals

1. **Cost accountability**: Track and limit spending at org and agent levels
2. **Smart optimization**: Route tasks to appropriate models based on complexity
3. **Graceful degradation**: Maintain service when limits are reached
4. **Transparency**: Give admins visibility into usage patterns and costs
5. **Flexibility**: Support both BYOK (Bring Your Own Keys) and managed plans

---

## Architecture

### Control Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│                    SYSTEM LAYER                         │
│  • Model registry (available models, pricing)           │
│  • Global rate limits                                   │
│  • Platform-wide enable/disable                         │
├─────────────────────────────────────────────────────────┤
│                     ORG LAYER                           │
│  • Billing mode (BYOK vs managed)                       │
│  • Enabled models (subset of system)                    │
│  • Cost limits (daily/monthly)                          │
│  • Default agent limits                                 │
│  • Model priorities                                     │
├─────────────────────────────────────────────────────────┤
│                    AGENT LAYER                          │
│  • Allowed models/modes (subset of org)                 │
│  • Cost limits (≤ org limits)                           │
│  • Degraded state tracking                              │
│  • Mode restrictions                                    │
└─────────────────────────────────────────────────────────┘
```

### Model Tiers

| Tier | Model ID | Display Name | Input $/1M | Output $/1M | Use Case |
|------|----------|--------------|------------|-------------|----------|
| mini | claude-3-5-haiku-20241022 | Haiku 3.5 | $0.25 | $1.25 | Quick Q&A, classification, degraded mode |
| standard | claude-sonnet-4-20250514 | Sonnet 4 | $3.00 | $15.00 | Code, analysis, moderate complexity |
| frontier | claude-opus-4-5-20251101 | Opus 4 | $15.00 | $75.00 | Architecture, strategy, deep reasoning |

---

## User-Facing Features

### Model Selection Modes

Users see a mode selector dropdown below the chat input:

```
┌─────────────────────────────────────────┐
│  [Type a message...]                    │
├─────────────────────────────────────────┤
│  Mode: [Auto ▼]              [Send]     │
└─────────────────────────────────────────┘
         │
         ├─ Auto    → Classifier routes to optimal
         ├─ Fast    → Always Haiku (mini)
         ├─ Smart   → Always Sonnet (standard)
         └─ Genius  → Always Opus (frontier)
```

**Mode Behaviors:**

| Mode | Behavior | Latency | Cost |
|------|----------|---------|------|
| Auto | Mini classifies task complexity, routes to appropriate tier | +200-400ms | Optimal |
| Fast | Direct to Haiku, no classification | Fastest | Lowest |
| Smart | Direct to Sonnet, no classification | Medium | Medium |
| Genius | Direct to Opus, no classification | Slowest | Highest |

### Response Model Badge

Each response shows which model was used:

```
┌─────────────────────────────────────────┐
│ Here's the analysis you requested...    │
│                                         │
│                    [🧠 opus · auto]     │
└─────────────────────────────────────────┘
```

Badge format: `[icon] [model] · [mode]`
- 🐇 haiku
- ⚡ sonnet  
- 🧠 opus

### Degraded Mode Banner

When an agent exceeds its cost limit, a persistent banner appears:

```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️ DEGRADED MODE                                        [×] │
│ Daily cost limit reached ($5.12 / $5.00). Using reduced-    │
│ capability model until tomorrow 00:00 UTC.                  │
│ [View Usage] [Contact Admin]                                │
└─────────────────────────────────────────────────────────────┘
```

**Banner states:**
- **Warning (yellow)**: 80%+ of limit reached
- **Degraded (red)**: Limit exceeded, using mini only

---

## Database Schema

### model_registry

System-wide model catalog with pricing and capabilities.

```sql
CREATE TABLE model_registry (
  id VARCHAR(100) PRIMARY KEY,           -- 'claude-opus-4-5-20251101'
  provider VARCHAR(50) NOT NULL,         -- 'anthropic' | 'openai'
  display_name VARCHAR(100) NOT NULL,    -- 'Claude Opus 4'
  tier VARCHAR(20) NOT NULL,             -- 'mini' | 'standard' | 'frontier'
  
  -- Pricing (per million tokens)
  input_cost_per_million NUMERIC(10,6) NOT NULL,
  output_cost_per_million NUMERIC(10,6) NOT NULL,
  cache_read_cost_per_million NUMERIC(10,6),
  cache_write_cost_per_million NUMERIC(10,6),
  
  -- Capabilities
  context_window INT NOT NULL,
  max_output_tokens INT NOT NULL,
  capabilities JSONB DEFAULT '{}',       -- {"vision": true, "tools": true, "thinking": true}
  
  -- Control
  enabled BOOLEAN DEFAULT true,          -- System-wide enable/disable
  priority INT DEFAULT 50,               -- Higher = preferred when equal tier
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_model_registry_tier ON model_registry(tier);
CREATE INDEX idx_model_registry_enabled ON model_registry(enabled);
```

### orgs table additions

```sql
ALTER TABLE orgs ADD COLUMN billing_mode VARCHAR(20) DEFAULT 'system_plan';
-- 'system_plan' | 'byok'

ALTER TABLE orgs ADD COLUMN model_config JSONB DEFAULT '{}';
-- {
--   "enabled_models": ["claude-opus-4-5-20251101", "claude-sonnet-4-20250514", "claude-3-5-haiku-20241022"],
--   "default_model": "claude-sonnet-4-20250514",
--   "allowed_tiers": ["mini", "standard", "frontier"],
--   "allowed_modes": ["auto", "fast", "smart", "genius"],
--   "classifier_enabled": true,
--   "priorities": {
--     "claude-opus-4-5-20251101": 80
--   }
-- }

ALTER TABLE orgs ADD COLUMN cost_limits JSONB DEFAULT '{}';
-- {
--   "daily_usd": 50.00,
--   "monthly_usd": 500.00,
--   "default_agent_daily_usd": 5.00,
--   "default_agent_monthly_usd": 50.00,
--   "alert_threshold_percent": 80,
--   "hard_limit": true
-- }

ALTER TABLE orgs ADD COLUMN cost_state JSONB DEFAULT '{}';
-- {
--   "current_daily_usd": 23.45,
--   "current_monthly_usd": 234.56,
--   "daily_reset_at": "2026-02-19T00:00:00Z",
--   "monthly_reset_at": "2026-03-01T00:00:00Z",
--   "degraded": false,
--   "degraded_since": null
-- }
```

### agents table additions

```sql
ALTER TABLE agents ADD COLUMN model_config JSONB DEFAULT '{}';
-- {
--   "allowed_models": null,       -- null = inherit from org
--   "allowed_tiers": null,        -- null = inherit from org
--   "allowed_modes": null,        -- null = all modes allowed
--   "default_mode": "auto",
--   "model_override": null        -- Force specific model always
-- }

ALTER TABLE agents ADD COLUMN cost_limits JSONB DEFAULT '{}';
-- {
--   "daily_usd": 5.00,
--   "monthly_usd": 50.00,
--   "inherited": true             -- Using org defaults
-- }

ALTER TABLE agents ADD COLUMN cost_state JSONB DEFAULT '{}';
-- {
--   "current_daily_usd": 2.34,
--   "current_monthly_usd": 45.67,
--   "daily_reset_at": "2026-02-19T00:00:00Z",
--   "monthly_reset_at": "2026-03-01T00:00:00Z",
--   "degraded": false,
--   "degraded_since": null,
--   "degraded_reason": null
-- }
```

### usage_records

Per-request usage logging for accurate cost tracking.

```sql
CREATE TABLE usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Context
  org_id VARCHAR NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  agent_id VARCHAR REFERENCES agents(id) ON DELETE SET NULL,
  user_id VARCHAR,
  session_id VARCHAR,
  
  -- Request details
  model_id VARCHAR(100) NOT NULL REFERENCES model_registry(id),
  mode VARCHAR(20) NOT NULL,             -- 'auto' | 'fast' | 'smart' | 'genius'
  classified_as VARCHAR(20),             -- 'mini' | 'standard' | 'frontier' (for auto mode)
  classification_score NUMERIC(3,2),     -- 0.00-1.00 complexity
  
  -- Token counts
  input_tokens INT NOT NULL,
  output_tokens INT NOT NULL,
  cache_read_tokens INT DEFAULT 0,
  cache_write_tokens INT DEFAULT 0,
  thinking_tokens INT DEFAULT 0,
  
  -- Cost
  cost_usd NUMERIC(10,6) NOT NULL,
  
  -- Performance
  latency_ms INT,
  classification_latency_ms INT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for aggregation queries
CREATE INDEX idx_usage_org_created ON usage_records(org_id, created_at);
CREATE INDEX idx_usage_agent_created ON usage_records(agent_id, created_at);
CREATE INDEX idx_usage_model ON usage_records(model_id, created_at);
CREATE INDEX idx_usage_date ON usage_records(DATE(created_at));
```

### cost_alerts

Track notifications sent to admins.

```sql
CREATE TABLE cost_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id VARCHAR NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  agent_id VARCHAR REFERENCES agents(id) ON DELETE SET NULL,
  
  alert_type VARCHAR(30) NOT NULL,
  -- 'warning_threshold' | 'limit_exceeded' | 'degraded_entered' | 'spend_spike'
  
  period_type VARCHAR(10) NOT NULL,      -- 'daily' | 'monthly'
  current_spend NUMERIC(10,4) NOT NULL,
  limit_amount NUMERIC(10,4) NOT NULL,
  threshold_percent INT,
  
  message TEXT NOT NULL,
  
  -- Delivery tracking
  delivered_at TIMESTAMP WITH TIME ZONE,
  delivered_via JSONB DEFAULT '[]',      -- ['in_app', 'email', 'webhook']
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  acknowledged_by VARCHAR,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_cost_alerts_org ON cost_alerts(org_id, created_at);
```

### usage_summaries (Pre-aggregated)

Roll-up table for fast analytics queries. Updated by background job.

```sql
CREATE TABLE usage_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Dimensions (nullable = aggregated across that dimension)
  period_type VARCHAR(10) NOT NULL,      -- 'hourly' | 'daily' | 'monthly'
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  org_id VARCHAR REFERENCES orgs(id) ON DELETE CASCADE,
  user_id VARCHAR,
  agent_id VARCHAR REFERENCES agents(id) ON DELETE SET NULL,
  model_id VARCHAR(100) REFERENCES model_registry(id),
  
  -- Metrics
  request_count INT NOT NULL DEFAULT 0,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  cache_read_tokens BIGINT NOT NULL DEFAULT 0,
  cache_write_tokens BIGINT NOT NULL DEFAULT 0,
  thinking_tokens BIGINT NOT NULL DEFAULT 0,
  total_tokens BIGINT GENERATED ALWAYS AS (input_tokens + output_tokens + thinking_tokens) STORED,
  cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  
  -- Performance
  avg_latency_ms INT,
  p95_latency_ms INT,
  
  -- Mode breakdown
  mode_counts JSONB DEFAULT '{}',        -- {"auto": 50, "fast": 20, "smart": 25, "genius": 5}
  tier_counts JSONB DEFAULT '{}',        -- {"mini": 30, "standard": 50, "frontier": 20}
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Unique constraint for upsert
  UNIQUE(period_type, period_start, org_id, user_id, agent_id, model_id)
);

-- Indexes for common query patterns
CREATE INDEX idx_usage_sum_org_period ON usage_summaries(org_id, period_type, period_start);
CREATE INDEX idx_usage_sum_agent_period ON usage_summaries(agent_id, period_type, period_start);
CREATE INDEX idx_usage_sum_user_period ON usage_summaries(user_id, period_type, period_start);
CREATE INDEX idx_usage_sum_model_period ON usage_summaries(model_id, period_type, period_start);
CREATE INDEX idx_usage_sum_period ON usage_summaries(period_type, period_start);
```

---

## Usage Analytics

### Query Scopes

The system supports querying usage by any combination of:

| Dimension | Description | Example |
|-----------|-------------|---------|
| **org** | Organization | "Earnware spent $234 this month" |
| **user** | Human user who triggered | "John used 1.2M tokens today" |
| **agent** | AI agent that processed | "Dan cost $45 this week" |
| **model** | Specific model used | "Opus usage across all orgs" |
| **mode** | Selection mode | "Auto mode vs manual breakdown" |
| **period** | Time window | Hour / Day / Week / Month |

### Aggregation Levels

```
RAW (usage_records)
  └── Per-request granularity
  └── Full detail, large volume
  └── Query for: debugging, recent activity
  
HOURLY (usage_summaries, period_type='hourly')
  └── Rolled up every hour
  └── Retained: 7 days
  └── Query for: real-time dashboards

DAILY (usage_summaries, period_type='daily')  
  └── Rolled up at midnight UTC
  └── Retained: 90 days
  └── Query for: daily reports, trends

MONTHLY (usage_summaries, period_type='monthly')
  └── Rolled up on 1st of month
  └── Retained: forever
  └── Query for: billing, long-term trends
```

### Summary Aggregation Job

Runs hourly to roll up usage_records into usage_summaries:

```typescript
async function aggregateUsage() {
  const now = new Date();
  
  // Hourly: aggregate last hour
  const hourStart = new Date(now);
  hourStart.setMinutes(0, 0, 0);
  hourStart.setHours(hourStart.getHours() - 1);
  
  await aggregatePeriod('hourly', hourStart);
  
  // Daily: aggregate yesterday (at midnight only)
  if (now.getUTCHours() === 0) {
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    dayStart.setUTCDate(dayStart.getUTCDate() - 1);
    
    await aggregatePeriod('daily', dayStart);
  }
  
  // Monthly: aggregate last month (on 1st only)
  if (now.getUTCDate() === 1 && now.getUTCHours() === 0) {
    const monthStart = new Date(now);
    monthStart.setUTCDate(1);
    monthStart.setUTCMonth(monthStart.getUTCMonth() - 1);
    
    await aggregatePeriod('monthly', monthStart);
  }
}

async function aggregatePeriod(periodType: string, periodStart: Date) {
  const periodEnd = getEndOfPeriod(periodType, periodStart);
  
  // Aggregate by all dimension combinations
  await db.execute(sql`
    INSERT INTO usage_summaries (
      period_type, period_start, org_id, user_id, agent_id, model_id,
      request_count, input_tokens, output_tokens, cache_read_tokens,
      cache_write_tokens, thinking_tokens, cost_usd, avg_latency_ms,
      mode_counts, tier_counts
    )
    SELECT 
      ${periodType},
      ${periodStart},
      org_id,
      user_id,
      agent_id,
      model_id,
      COUNT(*),
      SUM(input_tokens),
      SUM(output_tokens),
      SUM(cache_read_tokens),
      SUM(cache_write_tokens),
      SUM(thinking_tokens),
      SUM(cost_usd),
      AVG(latency_ms)::INT,
      jsonb_object_agg(mode, mode_count),
      jsonb_object_agg(tier, tier_count)
    FROM usage_records
    WHERE created_at >= ${periodStart} AND created_at < ${periodEnd}
    GROUP BY GROUPING SETS (
      (org_id),
      (org_id, user_id),
      (org_id, agent_id),
      (org_id, model_id),
      (org_id, user_id, agent_id),
      (org_id, agent_id, model_id),
      (org_id, user_id, agent_id, model_id)
    )
    ON CONFLICT (period_type, period_start, org_id, user_id, agent_id, model_id)
    DO UPDATE SET
      request_count = EXCLUDED.request_count,
      input_tokens = EXCLUDED.input_tokens,
      output_tokens = EXCLUDED.output_tokens,
      cache_read_tokens = EXCLUDED.cache_read_tokens,
      cache_write_tokens = EXCLUDED.cache_write_tokens,
      thinking_tokens = EXCLUDED.thinking_tokens,
      cost_usd = EXCLUDED.cost_usd,
      avg_latency_ms = EXCLUDED.avg_latency_ms,
      mode_counts = EXCLUDED.mode_counts,
      tier_counts = EXCLUDED.tier_counts,
      updated_at = NOW()
  `);
}
```

### Common Query Patterns

**Org total spend this month:**
```sql
SELECT cost_usd, input_tokens, output_tokens, request_count
FROM usage_summaries
WHERE org_id = $1
  AND period_type = 'monthly'
  AND period_start = date_trunc('month', NOW())
  AND user_id IS NULL
  AND agent_id IS NULL
  AND model_id IS NULL;
```

**Per-agent breakdown for org:**
```sql
SELECT 
  agent_id,
  a.name as agent_name,
  cost_usd,
  request_count,
  total_tokens
FROM usage_summaries us
JOIN agents a ON a.id = us.agent_id
WHERE us.org_id = $1
  AND period_type = 'daily'
  AND period_start = CURRENT_DATE
  AND user_id IS NULL
  AND model_id IS NULL
  AND agent_id IS NOT NULL
ORDER BY cost_usd DESC;
```

**Per-model breakdown for agent:**
```sql
SELECT 
  model_id,
  mr.display_name,
  mr.tier,
  cost_usd,
  input_tokens,
  output_tokens,
  request_count
FROM usage_summaries us
JOIN model_registry mr ON mr.id = us.model_id
WHERE us.agent_id = $1
  AND period_type = 'daily'
  AND period_start = CURRENT_DATE
  AND user_id IS NULL
  AND model_id IS NOT NULL
ORDER BY cost_usd DESC;
```

**User activity across all agents:**
```sql
SELECT 
  us.agent_id,
  a.name as agent_name,
  us.cost_usd,
  us.request_count
FROM usage_summaries us
JOIN agents a ON a.id = us.agent_id
WHERE us.user_id = $1
  AND us.org_id = $2
  AND period_type = 'daily'
  AND period_start >= CURRENT_DATE - INTERVAL '7 days'
  AND model_id IS NULL
  AND agent_id IS NOT NULL
ORDER BY period_start DESC, cost_usd DESC;
```

**System-wide model usage (sys_admin):**
```sql
SELECT 
  model_id,
  mr.display_name,
  SUM(cost_usd) as total_cost,
  SUM(request_count) as total_requests,
  SUM(input_tokens) as total_input,
  SUM(output_tokens) as total_output
FROM usage_summaries us
JOIN model_registry mr ON mr.id = us.model_id
WHERE period_type = 'daily'
  AND period_start >= CURRENT_DATE - INTERVAL '30 days'
  AND org_id IS NOT NULL
  AND user_id IS NULL
  AND agent_id IS NULL
  AND model_id IS NOT NULL
GROUP BY model_id, mr.display_name
ORDER BY total_cost DESC;
```

### API Endpoints for Analytics

```
GET /api/usage/summary
  Query params:
    - org_id (required for non-sys-admin)
    - user_id (optional)
    - agent_id (optional)
    - model_id (optional)
    - period: 'hour' | 'day' | 'week' | 'month'
    - start_date, end_date
    - group_by: 'org' | 'user' | 'agent' | 'model' | 'mode'
  
  Response: {
    summary: {
      total_cost_usd: number,
      total_tokens: number,
      request_count: number,
      period: { start: string, end: string }
    },
    breakdown: [{
      dimension_id: string,
      dimension_name: string,
      cost_usd: number,
      tokens: number,
      requests: number,
      percent_of_total: number
    }],
    time_series: [{
      period_start: string,
      cost_usd: number,
      tokens: number,
      requests: number
    }]
  }

GET /api/usage/export
  Query params: same as /summary
  Response: CSV download

GET /api/usage/realtime
  Query params:
    - org_id
    - agent_id (optional)
  Response: {
    current_daily_spend: number,
    daily_limit: number,
    current_monthly_spend: number,
    monthly_limit: number,
    last_request: { timestamp, model, cost },
    requests_last_hour: number
  }
```

---

## Billing & Accounting

### Overview

The accounting system tracks token/credit balances and integrates with Stripe for payments. Supports multiple billing modes with system-level overrides.

### Billing Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `prepaid` | Buy credits upfront, deduct on usage | Self-service orgs |
| `postpaid` | Accumulate usage, invoice monthly | Enterprise clients |
| `demo` | Free credits, no payment required | Trials, POCs |
| `byok` | Bring own API keys, no billing | Advanced users |
| `unlimited` | No limits (sys admin override) | Internal, partners |

### token_accounts

One account per billable entity (org). Tracks balance and billing configuration.

```sql
CREATE TABLE token_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Owner
  org_id VARCHAR UNIQUE REFERENCES orgs(id) ON DELETE CASCADE,
  
  -- Balance
  balance_credits BIGINT DEFAULT 0,          -- Available credits (1 credit = ~1 token)
  balance_usd NUMERIC(12,4) DEFAULT 0,       -- USD balance (for postpaid: amount owed)
  
  -- Billing configuration
  billing_mode VARCHAR(20) NOT NULL DEFAULT 'demo',
  -- 'prepaid' | 'postpaid' | 'demo' | 'byok' | 'unlimited'
  
  -- Credit allocations
  demo_credits_total BIGINT DEFAULT 0,       -- Total demo credits issued
  demo_credits_used BIGINT DEFAULT 0,        -- Demo credits consumed
  demo_credits_expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Limits
  credit_limit_usd NUMERIC(10,2),            -- Postpaid: max before suspension
  daily_limit_usd NUMERIC(10,2),             -- Hard daily cap (any mode)
  monthly_limit_usd NUMERIC(10,2),           -- Hard monthly cap (any mode)
  
  -- Stripe integration
  stripe_customer_id VARCHAR,
  stripe_subscription_id VARCHAR,
  stripe_payment_method_id VARCHAR,
  
  -- Overrides (sys admin only)
  sys_override BOOLEAN DEFAULT false,        -- If true, sys settings override org
  sys_override_reason TEXT,
  sys_override_by VARCHAR,                   -- Admin who set override
  sys_override_at TIMESTAMP WITH TIME ZONE,
  
  -- Org-level override of agent defaults
  org_override_agent_limits BOOLEAN DEFAULT false,
  
  -- State
  status VARCHAR(20) DEFAULT 'active',
  -- 'active' | 'suspended' | 'payment_failed' | 'closed'
  suspended_at TIMESTAMP WITH TIME ZONE,
  suspended_reason TEXT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_token_accounts_org ON token_accounts(org_id);
CREATE INDEX idx_token_accounts_stripe ON token_accounts(stripe_customer_id);
```

### token_transactions

Immutable ledger of all credit/debit events. Never deleted, only appended.

```sql
CREATE TABLE token_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES token_accounts(id) ON DELETE CASCADE,
  
  -- Transaction type
  type VARCHAR(30) NOT NULL,
  -- Credits added:
  --   'credit_purchase'    - Bought via Stripe
  --   'subscription_alloc' - Monthly subscription allocation
  --   'demo_grant'         - Demo/trial credits issued
  --   'admin_adjustment'   - Manual adjustment by admin
  --   'refund'             - Refund issued
  --   'promo'              - Promotional credits
  -- Credits consumed:
  --   'usage'              - AI model usage
  --   'demo_usage'         - Usage against demo credits
  -- Credits removed:
  --   'expiry'             - Credits expired
  --   'revoked'            - Admin revoked credits
  
  -- Amounts
  credits BIGINT,                            -- Credit delta (+/-)
  amount_usd NUMERIC(10,4),                  -- USD delta (+/-)
  tokens_consumed BIGINT,                    -- Actual tokens (for usage type)
  
  -- Running balance after transaction
  balance_credits_after BIGINT,
  balance_usd_after NUMERIC(12,4),
  
  -- Source references
  usage_record_id UUID REFERENCES usage_records(id),
  stripe_payment_intent_id VARCHAR,
  stripe_invoice_id VARCHAR,
  stripe_charge_id VARCHAR,
  
  -- Context
  org_id VARCHAR,
  agent_id VARCHAR,
  user_id VARCHAR,
  model_id VARCHAR(100),
  
  -- Audit
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR                         -- User ID or 'system' or 'stripe'
);

CREATE INDEX idx_token_txn_account ON token_transactions(account_id, created_at DESC);
CREATE INDEX idx_token_txn_type ON token_transactions(type, created_at DESC);
CREATE INDEX idx_token_txn_stripe ON token_transactions(stripe_payment_intent_id);
CREATE INDEX idx_token_txn_usage ON token_transactions(usage_record_id);
```

### billing_periods

Tracks invoice cycles for postpaid accounts.

```sql
CREATE TABLE billing_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES token_accounts(id) ON DELETE CASCADE,
  
  -- Period
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Accumulated totals
  total_credits_used BIGINT DEFAULT 0,
  total_tokens BIGINT DEFAULT 0,
  total_cost_usd NUMERIC(10,4) DEFAULT 0,
  request_count INT DEFAULT 0,
  
  -- Per-model breakdown
  model_breakdown JSONB DEFAULT '{}',
  -- { "claude-opus-4-5-20251101": { "tokens": 50000, "cost": 2.50 }, ... }
  
  -- Invoice
  stripe_invoice_id VARCHAR,
  stripe_invoice_url VARCHAR,
  stripe_invoice_pdf VARCHAR,
  invoice_status VARCHAR(20),                -- 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'
  invoice_amount_usd NUMERIC(10,2),
  invoice_due_date TIMESTAMP WITH TIME ZONE,
  invoice_paid_at TIMESTAMP WITH TIME ZONE,
  
  -- State
  status VARCHAR(20) DEFAULT 'open',         -- 'open' | 'closed' | 'invoiced' | 'paid'
  closed_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(account_id, period_start)
);

CREATE INDEX idx_billing_periods_account ON billing_periods(account_id, period_start DESC);
CREATE INDEX idx_billing_periods_status ON billing_periods(status);
CREATE INDEX idx_billing_periods_stripe ON billing_periods(stripe_invoice_id);
```

### credit_packages

Predefined credit packages for purchase.

```sql
CREATE TABLE credit_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  name VARCHAR(100) NOT NULL,                -- "Starter", "Pro", "Enterprise"
  description TEXT,
  
  -- Credits included
  credits BIGINT NOT NULL,                   -- Number of credits
  
  -- Pricing
  price_usd NUMERIC(10,2) NOT NULL,
  stripe_price_id VARCHAR,                   -- Stripe Price ID for checkout
  
  -- Validity
  expires_days INT,                          -- Credits expire after N days (null = never)
  
  -- Availability
  active BOOLEAN DEFAULT true,
  visible BOOLEAN DEFAULT true,              -- Show in UI
  org_types JSONB,                           -- Restrict to org types: ["startup", "enterprise"]
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed packages
INSERT INTO credit_packages (name, description, credits, price_usd, expires_days) VALUES
  ('Demo', 'Free trial credits', 100000, 0, 30),
  ('Starter', '1M credits', 1000000, 10.00, NULL),
  ('Pro', '10M credits', 10000000, 80.00, NULL),
  ('Enterprise', '100M credits', 100000000, 500.00, NULL);
```

### Billing Flows

**Demo Credits (New Org)**
```
1. Org created
2. System creates token_account with billing_mode='demo'
3. System grants demo credits:
   INSERT INTO token_transactions (
     account_id, type, credits, balance_credits_after, description
   ) VALUES (
     $account_id, 'demo_grant', 100000, 100000, 'Welcome credits'
   )
4. Update account balance
5. Usage deducts from demo credits first
6. When demo exhausted → prompt to upgrade
```

**Prepaid Purchase**
```
1. User selects credit package
2. Redirect to Stripe Checkout (or Payment Element)
3. Stripe webhook: payment_intent.succeeded
4. Create token_transaction:
   type='credit_purchase', credits=package.credits
5. Update account balance
6. If first purchase, set billing_mode='prepaid'
```

**Postpaid Invoice**
```
1. Enterprise org, billing_mode='postpaid'
2. Usage creates token_transaction with amount_usd
3. Accumulates in current billing_period
4. End of month (cron job):
   a. Close billing period
   b. Create Stripe invoice with line items
   c. Stripe sends invoice to customer
5. Webhook: invoice.paid → update billing_period status
6. Webhook: invoice.payment_failed → suspend account
```

**Sys Override**
```
1. Sys admin sets sys_override=true on account
2. Can set:
   - billing_mode='unlimited' (no limits)
   - Custom limits
   - Grant free credits
3. Override reason logged for audit
4. Org settings show "Managed by system administrator"
```

### Credit Consumption Logic

```typescript
async function consumeCredits(
  accountId: string,
  tokensUsed: number,
  costUsd: number,
  context: { orgId: string; agentId?: string; userId?: string; modelId: string }
): Promise<{ success: boolean; error?: string }> {
  
  const account = await getAccount(accountId);
  
  // Check billing mode
  if (account.billing_mode === 'byok') {
    // No credit tracking for BYOK
    return { success: true };
  }
  
  if (account.billing_mode === 'unlimited') {
    // Log but don't deduct
    await logUsage(account, tokensUsed, costUsd, context);
    return { success: true };
  }
  
  // Check if suspended
  if (account.status === 'suspended') {
    return { success: false, error: 'Account suspended' };
  }
  
  // Calculate credits to deduct (1 credit ≈ 1 token, adjusted by model)
  const creditsToDeduct = calculateCredits(tokensUsed, context.modelId);
  
  // Check balance
  if (account.billing_mode === 'prepaid' || account.billing_mode === 'demo') {
    // Check demo credits first
    const demoRemaining = account.demo_credits_total - account.demo_credits_used;
    
    if (demoRemaining > 0) {
      const demoDeduct = Math.min(demoRemaining, creditsToDeduct);
      await deductDemoCredits(account, demoDeduct, tokensUsed, costUsd, context);
      
      if (demoDeduct < creditsToDeduct) {
        // Remainder from paid credits
        const paidDeduct = creditsToDeduct - demoDeduct;
        if (account.balance_credits < paidDeduct) {
          return { success: false, error: 'Insufficient credits' };
        }
        await deductPaidCredits(account, paidDeduct, tokensUsed, costUsd, context);
      }
    } else {
      if (account.balance_credits < creditsToDeduct) {
        return { success: false, error: 'Insufficient credits' };
      }
      await deductPaidCredits(account, creditsToDeduct, tokensUsed, costUsd, context);
    }
  }
  
  if (account.billing_mode === 'postpaid') {
    // Add to current period, check credit limit
    const period = await getCurrentBillingPeriod(accountId);
    const projectedTotal = period.total_cost_usd + costUsd;
    
    if (account.credit_limit_usd && projectedTotal > account.credit_limit_usd) {
      return { success: false, error: 'Credit limit exceeded' };
    }
    
    await recordPostpaidUsage(account, period, tokensUsed, costUsd, context);
  }
  
  return { success: true };
}
```

### Stripe Integration

**Webhooks to Handle:**
```typescript
const STRIPE_WEBHOOKS = {
  // Payments
  'payment_intent.succeeded': handlePaymentSuccess,
  'payment_intent.payment_failed': handlePaymentFailed,
  
  // Invoices (postpaid)
  'invoice.created': handleInvoiceCreated,
  'invoice.finalized': handleInvoiceFinalized,
  'invoice.paid': handleInvoicePaid,
  'invoice.payment_failed': handleInvoicePaymentFailed,
  'invoice.voided': handleInvoiceVoided,
  
  // Subscriptions (if using)
  'customer.subscription.created': handleSubscriptionCreated,
  'customer.subscription.updated': handleSubscriptionUpdated,
  'customer.subscription.deleted': handleSubscriptionDeleted,
  
  // Customer
  'customer.updated': handleCustomerUpdated,
};
```

**API Endpoints:**
```
POST /api/billing/checkout
  Body: { package_id: string }
  Response: { checkout_url: string }
  
GET  /api/billing/account
  Response: { account: TokenAccount, current_period?: BillingPeriod }

GET  /api/billing/transactions
  Query: { limit, offset, type }
  Response: { transactions: TokenTransaction[] }

GET  /api/billing/invoices
  Response: { invoices: BillingPeriod[] }

POST /api/billing/portal
  Response: { portal_url: string }  -- Stripe Customer Portal

-- Admin only
POST /api/admin/billing/grant-credits
  Body: { org_id, credits, reason, expires_days? }
  
POST /api/admin/billing/set-override
  Body: { org_id, billing_mode?, limits?, reason }

POST /api/admin/billing/suspend
  Body: { org_id, reason }

POST /api/admin/billing/unsuspend
  Body: { org_id }
```

### UI Components

**Account Status Badge:**
```
┌─────────────────────────────────────┐
│ 💳 Prepaid · 2.4M credits remaining │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 🎁 Demo · 45K of 100K credits used  │
│ Expires in 12 days · [Upgrade]      │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 📄 Postpaid · $234.56 this month    │
│ Next invoice: Mar 1                 │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ ⚠️ Suspended · Payment failed       │
│ [Update Payment Method]             │
└─────────────────────────────────────┘
```

### Data Retention

| Table | Retention | Cleanup |
|-------|-----------|---------|
| usage_records | 30 days | Daily job deletes older |
| usage_summaries (hourly) | 7 days | Daily job deletes older |
| usage_summaries (daily) | 90 days | Monthly job deletes older |
| usage_summaries (monthly) | Forever | Never deleted |
| cost_alerts | 1 year | Monthly job deletes older |

### Cleanup Job

```typescript
async function cleanupOldUsageData() {
  // Delete raw records older than 30 days
  await db.execute(sql`
    DELETE FROM usage_records 
    WHERE created_at < NOW() - INTERVAL '30 days'
  `);
  
  // Delete hourly summaries older than 7 days
  await db.execute(sql`
    DELETE FROM usage_summaries 
    WHERE period_type = 'hourly' 
      AND period_start < NOW() - INTERVAL '7 days'
  `);
  
  // Delete daily summaries older than 90 days
  await db.execute(sql`
    DELETE FROM usage_summaries 
    WHERE period_type = 'daily' 
      AND period_start < NOW() - INTERVAL '90 days'
  `);
  
  // Delete alerts older than 1 year
  await db.execute(sql`
    DELETE FROM cost_alerts 
    WHERE created_at < NOW() - INTERVAL '1 year'
  `);
}
```

---

## API Endpoints

### Model Registry (System Admin)

```
GET    /api/admin/models              List all models with pricing
POST   /api/admin/models              Add new model
PUT    /api/admin/models/:id          Update model config
DELETE /api/admin/models/:id          Disable model
```

### Org Cost Management

```
GET    /api/orgs/:id/usage            Get usage summary (daily/monthly)
GET    /api/orgs/:id/usage/breakdown  Detailed per-agent breakdown
GET    /api/orgs/:id/cost-config      Get limits and model config
PUT    /api/orgs/:id/cost-config      Update limits and model config
GET    /api/orgs/:id/alerts           List cost alerts
POST   /api/orgs/:id/alerts/:id/ack   Acknowledge alert
```

### Agent Cost Management

```
GET    /api/agents/:id/usage          Get agent usage summary
GET    /api/agents/:id/cost-config    Get agent cost config
PUT    /api/agents/:id/cost-config    Update agent cost config
POST   /api/agents/:id/clear-degraded Clear degraded state (admin only)
```

### Chat Integration

```
POST   /api/soft-agent/:id/chat
  Body: {
    message: string,
    mode: 'auto' | 'fast' | 'smart' | 'genius'  // NEW
  }
  
  Response additions: {
    model_used: string,
    mode: string,
    classification?: {
      complexity: number,
      reasoning: string,
      routed_to: string
    },
    usage: {
      input_tokens: number,
      output_tokens: number,
      cost_usd: number
    },
    degraded: boolean
  }
```

---

## Classification System

### Classifier Prompt

```
You are a task complexity classifier. Analyze the user's message and return a JSON classification.

User message:
"""
{message}
"""

Return ONLY valid JSON with these fields:
{
  "complexity": <0.0-1.0, where 0=trivial, 1=frontier-level>,
  "reasoning": "<none|light|deep>",
  "creativity": "<none|some|high>",
  "code_generation": <true|false>,
  "multi_step": <true|false>,
  "domain": "<general|technical|creative|analytical|strategic>"
}

Guidelines:
- complexity 0.0-0.3: Simple questions, formatting, basic lookups
- complexity 0.3-0.6: Moderate analysis, simple code, explanations
- complexity 0.6-0.8: Complex code, deep analysis, multi-part problems
- complexity 0.8-1.0: Architecture, strategy, novel solutions, research

JSON:
```

### Router Logic

```typescript
interface Classification {
  complexity: number;
  reasoning: 'none' | 'light' | 'deep';
  creativity: 'none' | 'some' | 'high';
  code_generation: boolean;
  multi_step: boolean;
  domain: string;
}

interface RoutingContext {
  orgConfig: OrgModelConfig;
  agentConfig: AgentModelConfig;
  agentState: AgentCostState;
}

function selectModel(
  classification: Classification,
  context: RoutingContext
): { model: string; tier: string; reason: string } {
  
  // Check degraded state first
  if (context.agentState.degraded) {
    return {
      model: 'claude-3-5-haiku-20241022',
      tier: 'mini',
      reason: 'degraded_mode'
    };
  }
  
  // Determine ideal tier based on classification
  let idealTier: 'mini' | 'standard' | 'frontier';
  let reason: string;
  
  if (classification.complexity >= 0.7 || classification.reasoning === 'deep') {
    idealTier = 'frontier';
    reason = 'high_complexity';
  } else if (
    classification.complexity >= 0.4 ||
    classification.code_generation ||
    classification.multi_step ||
    classification.reasoning === 'light' ||
    classification.creativity === 'some'
  ) {
    idealTier = 'standard';
    reason = 'moderate_complexity';
  } else {
    idealTier = 'mini';
    reason = 'simple_task';
  }
  
  // Apply org/agent restrictions
  const allowedTiers = context.agentConfig.allowed_tiers 
    ?? context.orgConfig.allowed_tiers 
    ?? ['mini', 'standard', 'frontier'];
  
  // Downgrade if ideal tier not allowed
  if (!allowedTiers.includes(idealTier)) {
    if (idealTier === 'frontier' && allowedTiers.includes('standard')) {
      idealTier = 'standard';
      reason = 'tier_restricted';
    } else {
      idealTier = 'mini';
      reason = 'tier_restricted';
    }
  }
  
  // Select highest priority model in tier
  const model = selectModelByTier(idealTier, context.orgConfig);
  
  return { model, tier: idealTier, reason };
}

function selectModelByTier(
  tier: string, 
  orgConfig: OrgModelConfig
): string {
  const enabledModels = orgConfig.enabled_models ?? [];
  const priorities = orgConfig.priorities ?? {};
  
  // Get models in tier, sorted by priority
  const candidates = enabledModels
    .filter(m => getModelTier(m) === tier)
    .sort((a, b) => (priorities[b] ?? 50) - (priorities[a] ?? 50));
  
  return candidates[0] ?? getDefaultModelForTier(tier);
}
```

---

## Request Flow

### Pre-Request Flow

```
1. Receive chat request with mode
2. Load org config, agent config, agent state
3. CHECK: Is agent degraded?
   → Yes: Force mini model, set degraded flag in response
   → No: Continue

4. CHECK: Would this request exceed limits?
   → Estimate cost based on input size
   → Compare against remaining budget
   → If would exceed:
      a. Set agent to degraded
      b. Send admin notification
      c. Force mini model

5. If mode == 'auto':
   a. Call classifier (mini model)
   b. Parse classification
   c. Route to appropriate model
   
6. If mode == 'fast'|'smart'|'genius':
   a. Check if mode is allowed for this agent
   b. Map to corresponding model
   c. If not allowed, fall back to highest allowed

7. Execute request with selected model
```

### Post-Request Flow

```
1. Calculate actual cost from token counts
2. Insert usage_record
3. Update agent cost_state (increment counters)
4. Update org cost_state (increment counters)
5. CHECK: Did this push over limit?
   → Yes: Set degraded, queue notification
6. CHECK: Did this push over warning threshold?
   → Yes: Queue warning notification (if not already sent this period)
7. Return response with usage metadata
```

---

## Cost Calculation

```typescript
function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number = 0,
  thinkingTokens: number = 0
): number {
  const model = getModelFromRegistry(modelId);
  
  const inputCost = (inputTokens / 1_000_000) * model.input_cost_per_million;
  const outputCost = (outputTokens / 1_000_000) * model.output_cost_per_million;
  const cacheCost = (cacheReadTokens / 1_000_000) * (model.cache_read_cost_per_million ?? 0);
  
  // Thinking tokens billed as output
  const thinkingCost = (thinkingTokens / 1_000_000) * model.output_cost_per_million;
  
  return inputCost + outputCost + cacheCost + thinkingCost;
}
```

---

## Period Reset Logic

A cron job runs at the top of each hour to handle resets:

```typescript
async function processPeriodResets() {
  const now = new Date();
  
  // Reset daily counters at midnight UTC
  if (now.getUTCHours() === 0) {
    await db.execute(sql`
      UPDATE agents 
      SET cost_state = cost_state || jsonb_build_object(
        'current_daily_usd', 0,
        'daily_reset_at', ${now.toISOString()},
        'degraded', CASE 
          WHEN (cost_state->>'degraded_reason') = 'daily_limit_exceeded' 
          THEN false 
          ELSE (cost_state->>'degraded')::boolean 
        END,
        'degraded_since', CASE 
          WHEN (cost_state->>'degraded_reason') = 'daily_limit_exceeded' 
          THEN null 
          ELSE cost_state->>'degraded_since' 
        END,
        'degraded_reason', CASE 
          WHEN (cost_state->>'degraded_reason') = 'daily_limit_exceeded' 
          THEN null 
          ELSE cost_state->>'degraded_reason' 
        END
      )
      WHERE cost_state->>'current_daily_usd' IS NOT NULL
    `);
    
    // Same for orgs
    await db.execute(sql`
      UPDATE orgs 
      SET cost_state = cost_state || jsonb_build_object(
        'current_daily_usd', 0,
        'daily_reset_at', ${now.toISOString()}
      )
      WHERE cost_state->>'current_daily_usd' IS NOT NULL
    `);
  }
  
  // Reset monthly counters on 1st of month
  if (now.getUTCDate() === 1 && now.getUTCHours() === 0) {
    // Similar logic for monthly counters
  }
}
```

---

## Admin Notifications

### Notification Types

| Type | Trigger | Urgency |
|------|---------|---------|
| `warning_threshold` | Spend reaches X% of limit | Medium |
| `limit_exceeded` | Spend exceeds limit | High |
| `degraded_entered` | Agent enters degraded mode | High |
| `degraded_cleared` | Agent exits degraded mode | Low |
| `spend_spike` | Spend is >2x normal rate | Medium |

### Notification Channels

1. **In-app**: Bell icon notification, links to usage dashboard
2. **Email**: Sent to org admins, includes summary and action links
3. **Webhook**: POST to configured URL with alert payload

### Notification Payload

```typescript
interface CostNotification {
  id: string;
  type: 'warning_threshold' | 'limit_exceeded' | 'degraded_entered' | 'spend_spike';
  org_id: string;
  org_name: string;
  agent_id?: string;
  agent_name?: string;
  
  period: 'daily' | 'monthly';
  current_spend: number;
  limit: number;
  percent_used: number;
  
  message: string;
  action_url: string;
  
  timestamp: string;
}
```

---

## UI Components

### Mode Selector

```tsx
interface ModeSelectorProps {
  value: 'auto' | 'fast' | 'smart' | 'genius';
  onChange: (mode: string) => void;
  allowedModes: string[];
  disabled?: boolean;
}

function ModeSelector({ value, onChange, allowedModes, disabled }: ModeSelectorProps) {
  const modes = [
    { id: 'auto', label: 'Auto', icon: '🎯', description: 'Smart routing' },
    { id: 'fast', label: 'Fast', icon: '🐇', description: 'Haiku' },
    { id: 'smart', label: 'Smart', icon: '⚡', description: 'Sonnet' },
    { id: 'genius', label: 'Genius', icon: '🧠', description: 'Opus' },
  ];
  
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-[120px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {modes.filter(m => allowedModes.includes(m.id)).map(mode => (
          <SelectItem key={mode.id} value={mode.id}>
            <span>{mode.icon} {mode.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

### Degraded Banner

```tsx
interface DegradedBannerProps {
  reason: string;
  since: string;
  resetAt: string;
  onViewUsage: () => void;
}

function DegradedBanner({ reason, since, resetAt, onViewUsage }: DegradedBannerProps) {
  return (
    <Alert variant="destructive" className="mb-4">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Degraded Mode</AlertTitle>
      <AlertDescription>
        {reason === 'daily_limit_exceeded' 
          ? `Daily cost limit reached. Using reduced-capability model until ${formatTime(resetAt)}.`
          : `Monthly cost limit reached. Using reduced-capability model.`
        }
        <Button variant="link" onClick={onViewUsage}>View Usage</Button>
      </AlertDescription>
    </Alert>
  );
}
```

### Usage Dashboard

See separate UI mockups in design checkpoint.

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

- [ ] Create `model_registry` table and seed with current models
- [ ] Add `model_config`, `cost_limits`, `cost_state` columns to orgs
- [ ] Add `model_config`, `cost_limits`, `cost_state` columns to agents
- [ ] Create `usage_records` table
- [ ] Implement `calculateCost()` function
- [ ] Add usage recording to `soft-agent-chat.ts`

### Phase 2: Limits & Degradation (Week 2)

- [ ] Implement pre-request budget check
- [ ] Implement degraded state management
- [ ] Add auto-downgrade to mini when limit exceeded
- [ ] Create cron job for period resets
- [ ] Create `cost_alerts` table
- [ ] Implement basic notification queueing

### Phase 3: Smart Routing (Week 3)

- [ ] Implement classifier prompt and parsing
- [ ] Implement router logic
- [ ] Add mode parameter to chat API
- [ ] Add mode selector component
- [ ] Add model badge to responses
- [ ] Add classification metadata to response

### Phase 4: Admin UI (Week 4)

- [ ] System Settings → Model Registry page
- [ ] Org Settings → Usage Dashboard
- [ ] Org Settings → Cost Configuration
- [ ] Agent Settings → Cost Controls
- [ ] Degraded mode banner component
- [ ] Warning banner component

### Phase 5: Notifications (Week 5)

- [ ] In-app notification system
- [ ] Email notification templates
- [ ] Webhook delivery
- [ ] Notification preferences UI

---

## Security Considerations

1. **API Key Storage**: BYOK keys stored encrypted in secrets table
2. **Cost Manipulation**: Only org admins can modify limits
3. **Audit Trail**: All limit changes logged
4. **Rate Limiting**: Prevent rapid requests that bypass checks
5. **Validation**: Server-side enforcement of all limits (never trust client)

---

## Future Enhancements

1. **Usage forecasting**: Predict month-end spend based on current rate
2. **Budget allocation**: Distribute org budget across agents
3. **Usage reports**: Scheduled email reports for admins
4. **Cost optimization suggestions**: Identify agents that could use cheaper models
5. **Team-level budgets**: Intermediate layer between org and agent
6. **Prepaid credits**: Org purchases credits, agents consume them

---

## Appendix: Migration Scripts

### Migration 001: Model Registry

```sql
-- migrations/001_model_registry.sql

CREATE TABLE IF NOT EXISTS model_registry (
  id VARCHAR(100) PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  tier VARCHAR(20) NOT NULL,
  input_cost_per_million NUMERIC(10,6) NOT NULL,
  output_cost_per_million NUMERIC(10,6) NOT NULL,
  cache_read_cost_per_million NUMERIC(10,6),
  cache_write_cost_per_million NUMERIC(10,6),
  context_window INT NOT NULL,
  max_output_tokens INT NOT NULL,
  capabilities JSONB DEFAULT '{}',
  enabled BOOLEAN DEFAULT true,
  priority INT DEFAULT 50,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed data
INSERT INTO model_registry (id, provider, display_name, tier, input_cost_per_million, output_cost_per_million, cache_read_cost_per_million, context_window, max_output_tokens, capabilities, priority) VALUES
  ('claude-opus-4-5-20251101', 'anthropic', 'Claude Opus 4', 'frontier', 15.0, 75.0, 1.875, 200000, 32000, '{"vision":true,"tools":true,"thinking":true}', 100),
  ('claude-sonnet-4-20250514', 'anthropic', 'Claude Sonnet 4', 'standard', 3.0, 15.0, 0.30, 200000, 64000, '{"vision":true,"tools":true,"thinking":true}', 50),
  ('claude-3-5-haiku-20241022', 'anthropic', 'Claude Haiku 3.5', 'mini', 0.25, 1.25, 0.025, 200000, 8192, '{"vision":true,"tools":true}', 10)
ON CONFLICT (id) DO NOTHING;
```

### Migration 002: Org Cost Columns

```sql
-- migrations/002_org_cost_columns.sql

ALTER TABLE orgs ADD COLUMN IF NOT EXISTS billing_mode VARCHAR(20) DEFAULT 'system_plan';
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS model_config JSONB DEFAULT '{}';
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS cost_limits JSONB DEFAULT '{}';
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS cost_state JSONB DEFAULT '{}';
```

### Migration 003: Agent Cost Columns

```sql
-- migrations/003_agent_cost_columns.sql

ALTER TABLE agents ADD COLUMN IF NOT EXISTS model_config JSONB DEFAULT '{}';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS cost_limits JSONB DEFAULT '{}';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS cost_state JSONB DEFAULT '{}';
```

### Migration 004: Usage Records

```sql
-- migrations/004_usage_records.sql

CREATE TABLE IF NOT EXISTS usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id VARCHAR NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  agent_id VARCHAR REFERENCES agents(id) ON DELETE SET NULL,
  user_id VARCHAR,
  session_id VARCHAR,
  model_id VARCHAR(100) NOT NULL,
  mode VARCHAR(20) NOT NULL,
  classified_as VARCHAR(20),
  classification_score NUMERIC(3,2),
  input_tokens INT NOT NULL,
  output_tokens INT NOT NULL,
  cache_read_tokens INT DEFAULT 0,
  cache_write_tokens INT DEFAULT 0,
  thinking_tokens INT DEFAULT 0,
  cost_usd NUMERIC(10,6) NOT NULL,
  latency_ms INT,
  classification_latency_ms INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_org_created ON usage_records(org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_agent_created ON usage_records(agent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_records(model_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_records(DATE(created_at));
```

### Migration 005: Cost Alerts

```sql
-- migrations/005_cost_alerts.sql

CREATE TABLE IF NOT EXISTS cost_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id VARCHAR NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  agent_id VARCHAR REFERENCES agents(id) ON DELETE SET NULL,
  alert_type VARCHAR(30) NOT NULL,
  period_type VARCHAR(10) NOT NULL,
  current_spend NUMERIC(10,4) NOT NULL,
  limit_amount NUMERIC(10,4) NOT NULL,
  threshold_percent INT,
  message TEXT NOT NULL,
  delivered_at TIMESTAMP WITH TIME ZONE,
  delivered_via JSONB DEFAULT '[]',
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  acknowledged_by VARCHAR,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cost_alerts_org ON cost_alerts(org_id, created_at);
```

### Migration 006: Usage Summaries

```sql
-- migrations/006_usage_summaries.sql

CREATE TABLE IF NOT EXISTS usage_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Dimensions
  period_type VARCHAR(10) NOT NULL,
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  org_id VARCHAR REFERENCES orgs(id) ON DELETE CASCADE,
  user_id VARCHAR,
  agent_id VARCHAR REFERENCES agents(id) ON DELETE SET NULL,
  model_id VARCHAR(100) REFERENCES model_registry(id),
  
  -- Metrics
  request_count INT NOT NULL DEFAULT 0,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  cache_read_tokens BIGINT NOT NULL DEFAULT 0,
  cache_write_tokens BIGINT NOT NULL DEFAULT 0,
  thinking_tokens BIGINT NOT NULL DEFAULT 0,
  total_tokens BIGINT GENERATED ALWAYS AS (input_tokens + output_tokens + thinking_tokens) STORED,
  cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  
  -- Performance
  avg_latency_ms INT,
  p95_latency_ms INT,
  
  -- Breakdowns
  mode_counts JSONB DEFAULT '{}',
  tier_counts JSONB DEFAULT '{}',
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(period_type, period_start, org_id, user_id, agent_id, model_id)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_usage_sum_org_period ON usage_summaries(org_id, period_type, period_start);
CREATE INDEX IF NOT EXISTS idx_usage_sum_agent_period ON usage_summaries(agent_id, period_type, period_start);
CREATE INDEX IF NOT EXISTS idx_usage_sum_user_period ON usage_summaries(user_id, period_type, period_start);
CREATE INDEX IF NOT EXISTS idx_usage_sum_model_period ON usage_summaries(model_id, period_type, period_start);
CREATE INDEX IF NOT EXISTS idx_usage_sum_period ON usage_summaries(period_type, period_start);
```

### Migration 007: Token Accounts

```sql
-- migrations/007_token_accounts.sql

CREATE TABLE IF NOT EXISTS token_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id VARCHAR UNIQUE REFERENCES orgs(id) ON DELETE CASCADE,
  
  balance_credits BIGINT DEFAULT 0,
  balance_usd NUMERIC(12,4) DEFAULT 0,
  
  billing_mode VARCHAR(20) NOT NULL DEFAULT 'demo',
  
  demo_credits_total BIGINT DEFAULT 0,
  demo_credits_used BIGINT DEFAULT 0,
  demo_credits_expires_at TIMESTAMP WITH TIME ZONE,
  
  credit_limit_usd NUMERIC(10,2),
  daily_limit_usd NUMERIC(10,2),
  monthly_limit_usd NUMERIC(10,2),
  
  stripe_customer_id VARCHAR,
  stripe_subscription_id VARCHAR,
  stripe_payment_method_id VARCHAR,
  
  sys_override BOOLEAN DEFAULT false,
  sys_override_reason TEXT,
  sys_override_by VARCHAR,
  sys_override_at TIMESTAMP WITH TIME ZONE,
  
  org_override_agent_limits BOOLEAN DEFAULT false,
  
  status VARCHAR(20) DEFAULT 'active',
  suspended_at TIMESTAMP WITH TIME ZONE,
  suspended_reason TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_accounts_org ON token_accounts(org_id);
CREATE INDEX IF NOT EXISTS idx_token_accounts_stripe ON token_accounts(stripe_customer_id);
```

### Migration 008: Token Transactions

```sql
-- migrations/008_token_transactions.sql

CREATE TABLE IF NOT EXISTS token_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES token_accounts(id) ON DELETE CASCADE,
  
  type VARCHAR(30) NOT NULL,
  
  credits BIGINT,
  amount_usd NUMERIC(10,4),
  tokens_consumed BIGINT,
  
  balance_credits_after BIGINT,
  balance_usd_after NUMERIC(12,4),
  
  usage_record_id UUID REFERENCES usage_records(id),
  stripe_payment_intent_id VARCHAR,
  stripe_invoice_id VARCHAR,
  stripe_charge_id VARCHAR,
  
  org_id VARCHAR,
  agent_id VARCHAR,
  user_id VARCHAR,
  model_id VARCHAR(100),
  
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR
);

CREATE INDEX IF NOT EXISTS idx_token_txn_account ON token_transactions(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_txn_type ON token_transactions(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_txn_stripe ON token_transactions(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_token_txn_usage ON token_transactions(usage_record_id);
```

### Migration 009: Billing Periods

```sql
-- migrations/009_billing_periods.sql

CREATE TABLE IF NOT EXISTS billing_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES token_accounts(id) ON DELETE CASCADE,
  
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  
  total_credits_used BIGINT DEFAULT 0,
  total_tokens BIGINT DEFAULT 0,
  total_cost_usd NUMERIC(10,4) DEFAULT 0,
  request_count INT DEFAULT 0,
  
  model_breakdown JSONB DEFAULT '{}',
  
  stripe_invoice_id VARCHAR,
  stripe_invoice_url VARCHAR,
  stripe_invoice_pdf VARCHAR,
  invoice_status VARCHAR(20),
  invoice_amount_usd NUMERIC(10,2),
  invoice_due_date TIMESTAMP WITH TIME ZONE,
  invoice_paid_at TIMESTAMP WITH TIME ZONE,
  
  status VARCHAR(20) DEFAULT 'open',
  closed_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(account_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_billing_periods_account ON billing_periods(account_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_billing_periods_status ON billing_periods(status);
CREATE INDEX IF NOT EXISTS idx_billing_periods_stripe ON billing_periods(stripe_invoice_id);
```

### Migration 010: Credit Packages

```sql
-- migrations/010_credit_packages.sql

CREATE TABLE IF NOT EXISTS credit_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  name VARCHAR(100) NOT NULL,
  description TEXT,
  
  credits BIGINT NOT NULL,
  price_usd NUMERIC(10,2) NOT NULL,
  stripe_price_id VARCHAR,
  
  expires_days INT,
  
  active BOOLEAN DEFAULT true,
  visible BOOLEAN DEFAULT true,
  org_types JSONB,
  
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed default packages
INSERT INTO credit_packages (name, description, credits, price_usd, expires_days) VALUES
  ('Demo', 'Free trial credits', 100000, 0, 30),
  ('Starter', '1M credits', 1000000, 10.00, NULL),
  ('Pro', '10M credits', 10000000, 80.00, NULL),
  ('Enterprise', '100M credits', 100000000, 500.00, NULL)
ON CONFLICT DO NOTHING;
```

---

*End of Specification*
