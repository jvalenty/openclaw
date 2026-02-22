# 2026-02-19 - Reseller Architecture Decision

## Context
While debugging agent OAuth (Stella couldn't store Google credentials because she had no org), we discovered a deeper architectural question: How do platform-level sys admins and machines relate to orgs?

## Problem
- Stella is a sys_admin agent running on Mac Mini
- She serves ALL customer orgs (Earnware, CXO, AMG, etc.)
- Secrets require an org_id to store
- If we tie her to one org, does that limit her?

## Options Considered

### Option 1: Sys Admin = Auto-creates Org
- Every sys_admin gets its own "machine org"
- **Rejected**: Overhead, doesn't match mental model

### Option 2: Platform Level Above Orgs  
- Platform machines/sys admins exist at system scope (org_id=NULL)
- e2e operates platform on behalf of customers
- **Rejected**: Creates special "platform" tier, e2e becomes special

### Option 3: Uniform Reseller Model ✅ CHOSEN
- Every org can be a reseller
- Machines belong to orgs
- Sys admins belong to machine's org
- Machines can be AUTHORIZED to serve other orgs
- Zero difference between e2e and future resellers

## Decision: Uniform Reseller Model

**Core principles:**
1. Every org is first-class (no special "platform" org)
2. Machines belong to orgs (owner)
3. Sys admins belong to machine's org, store secrets there
4. Multi-tenant: machines can serve multiple authorized orgs
5. Any org can become a reseller

**Current state (e2e as first reseller):**
```
e2e (org)
  └── Machines (Mac Mini, owned by e2e)
        └── Sys Admin (Stella Hard, org_id = e2e)
              └── Authorized to serve: Earnware, CXO, AMG...
              └── Secrets stored under e2e org
```

**Future state (customer becomes reseller):**
```
AMG (org, becomes reseller)
  └── AMG's Machines
        └── AMG's Sys Admin
              └── Authorized to serve: AMG's sub-customers
```

## Implications

### For Stella (immediate fix)
- Set Stella's organization_id = e2e org
- OAuth secrets store under e2e
- She can still serve all orgs via authorization

### Schema Changes Needed
- `machine_org_access` table: which orgs a machine can serve
- Or: `machines.authorized_orgs` JSON array
- Sys admin context switches based on which org they're serving

### Code Changes
- When sys admin operates for a customer org, use customer's context
- Secrets always stored under sys admin's owning org
- Multi-tenant authorization checks

## Benefits
- Simple, uniform model
- No special cases for "platform"
- Any org can scale to reseller
- Clean separation: ownership vs authorization
- Fits existing org-centric architecture

## Next Steps
1. Write detailed spec
2. Implement machine_org_access
3. Fix Stella's org assignment
4. Update OAuth flow to use agent's org
5. Add context-switching for multi-tenant operations
