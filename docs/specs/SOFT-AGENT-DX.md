# Soft Agent Developer Experience Spec

**Status:** Draft  
**Author:** Stella  
**Date:** 2026-02-12

## Executive Summary

Improve visibility and debugging for soft agent development. Currently it's "configure and pray" — developers can't see what prompt gets assembled or which knowledge gets injected. This spec adds transparency without rebuilding the architecture.

---

## Current State

### What Exists ✅

| Feature | Location | Status |
|---------|----------|--------|
| **systemPrompt editing** | Agent Edit → Soul tab | Working |
| **Prompt versioning** | `document_versions` table | Working, auto-tracks changes |
| **Skills management** | AdminSkills.tsx | Working, assigns by UUID |
| **Knowledge management** | AdminContext.tsx | Working, scoped (system/org/agent) |
| **Permission management** | Agent Edit → Actions tab | Working |

### What's Missing ❌

1. **No assembled prompt preview** — Can't see what Claude actually receives
2. **No knowledge injection visibility** — Which 10 docs? Priority order?
3. **No debug panel during chat** — When agent misbehaves, no way to diagnose
4. **Version history UI is hidden** — Exists but not surfaced in Agent Edit
5. **Memory browser is basic** — Can't easily see/edit what agent has learned

---

## Proposed Changes

### 1. Assembled Prompt Preview

**Location:** Agent Edit page → new "Preview" button

**Endpoint:** `GET /api/agents/:id/prompt-preview`

```typescript
// Response
{
  sections: [
    { name: "Identity", content: "You are **Dan**. Newsletter oversight specialist..." },
    { name: "System Prompt", content: "...", source: "modelConfig.systemPrompt" },
    { name: "User Context", content: "(dynamic at runtime)" },
    { name: "Tool Guidance", content: "You have access to various tools..." },
    { name: "Skills", content: "### Brand Oversight\n...", source: "skills[uuid1, uuid2]" },
    { name: "Knowledge", content: "### Weekly Process\n...", source: "knowledge[5 docs]" }
  ],
  totalTokens: 4520,  // estimated
  knowledgeDocs: [
    { id: "xxx", title: "Weekly Process", scope: "org", priority: 100, included: true },
    { id: "yyy", title: "Brand Guidelines", scope: "agent", priority: 90, included: true },
    { id: "zzz", title: "API Reference", scope: "system", priority: 50, included: false, reason: "over limit" }
  ],
  skills: [
    { id: "uuid1", name: "brand-oversight", displayName: "Brand Oversight", tokenCount: 850 }
  ]
}
```

**UI:** Modal or slide-out panel showing:
- Collapsible sections with source attribution
- Token count per section + total
- Knowledge docs table showing what's included/excluded and why
- "Copy Full Prompt" button for debugging

### 2. Knowledge Injection Audit

**Enhancement to existing Context tab in Agent Edit**

Currently shows agent-specific knowledge only. Enhance to show:

```
┌─────────────────────────────────────────────────────────────┐
│ Knowledge Injection Preview                                  │
├─────────────────────────────────────────────────────────────┤
│ ✅ INCLUDED (5 of 12 matching docs)                         │
│                                                              │
│ 1. [org] Weekly Newsletter Process      priority: 100  ✓    │
│ 2. [agent] Dan's Responsibilities       priority: 95   ✓    │
│ 3. [system] API Schema Reference        priority: 80   ✓    │
│ 4. [org] Brand Guidelines               priority: 75   ✓    │
│ 5. [agent] Learned: Prefer Slack        priority: 50   ✓    │
│                                                              │
│ ⚠️ EXCLUDED (7 docs over limit)                             │
│                                                              │
│ 6. [system] Database Schema             priority: 40   ✗    │
│ 7. [org] Old Process (deprecated)       priority: 30   ✗    │
│ ...                                                          │
│                                                              │
│ Total tokens: ~2,100 | Limit: 10 docs                       │
└─────────────────────────────────────────────────────────────┘
```

### 3. Debug Panel in Chat

**Location:** Chat sidebar → toggle "Debug Mode"

When enabled, shows alongside each assistant message:

```
┌─────────────────────────────────────────────────────────────┐
│ 🔍 Debug Info                                                │
├─────────────────────────────────────────────────────────────┤
│ Model: claude-sonnet-4-20250514                              │
│ Input tokens: 4,520 | Output tokens: 342                    │
│ Tools available: 12 | Tools called: 2                       │
│                                                              │
│ Tool Calls:                                                  │
│ 1. sheets_read(spreadsheet_id="1gFB...", range="A1:D10")   │
│    → 45 rows returned                                        │
│ 2. memory_save(type="fact", title="Brand count")            │
│    → Saved as knowledge entry xxx                            │
│                                                              │
│ [View Full Prompt] [View Raw Response]                       │
└─────────────────────────────────────────────────────────────┘
```

**Storage:** Add `debug` field to `chat_messages.metadata`:

```typescript
metadata: {
  debug: {
    model: string,
    inputTokens: number,
    outputTokens: number,
    toolCalls: Array<{ name: string, input: any, output: string }>,
    promptHash: string,  // for linking to cached prompt snapshot
  }
}
```

### 4. Version History in Agent Edit

**Location:** Agent Edit → Soul tab → "History" button

Surface existing `document_versions` data:

```
┌─────────────────────────────────────────────────────────────┐
│ System Prompt History                              [Restore] │
├─────────────────────────────────────────────────────────────┤
│ v5 (current) - Feb 12, 2026 1:15 PM                         │
│   "Added Slack notification instructions"                    │
│                                                              │
│ v4 - Feb 11, 2026 3:22 PM                                   │
│   "Clarified weekly schedule"                                │
│                                                              │
│ v3 - Feb 10, 2026 9:45 AM                                   │
│   "Initial production prompt"                                │
│                                                              │
│ [Compare v4 ↔ v5]                                           │
└─────────────────────────────────────────────────────────────┘
```

API already exists: `GET /api/versions/agents/:agentId`

### 5. Memory Browser Enhancement

**Location:** Agent Edit → Context tab → "Browse Memory" button

Full CRUD for agent's knowledge entries with:
- Filter by type (fact/decision/lesson/preference/rule/note)
- Sort by priority, date, confidence
- Inline edit/delete
- See extraction source (manual vs auto-extracted)
- Bulk approve/reject for pending entries

---

## Implementation Priority

| Phase | Feature | Effort | Impact |
|-------|---------|--------|--------|
| **P1** | Assembled Prompt Preview | Medium | High — answers "what does my agent see?" |
| **P1** | Version History UI | Low | Medium — surface existing functionality |
| **P2** | Knowledge Injection Audit | Medium | High — explains inclusion/exclusion |
| **P2** | Memory Browser Enhancement | Medium | Medium — better self-learning management |
| **P3** | Debug Panel in Chat | High | High — runtime diagnosis |

---

## API Changes

### New Endpoints

```
GET  /api/agents/:id/prompt-preview
     Returns assembled prompt breakdown with token counts

GET  /api/agents/:id/knowledge-audit
     Returns all matching knowledge docs with inclusion status
```

### Enhanced Endpoints

```
GET  /api/soft-agent/chat (existing)
     Add ?debug=true to include debug info in response metadata
```

---

## Database Changes

None required. Uses existing tables:
- `document_versions` — prompt history
- `knowledge` — context docs
- `skills` — capability definitions
- `chat_messages.metadata` — debug info storage

---

## UI Components Needed

1. `PromptPreviewModal` — collapsible sections, token counts
2. `KnowledgeAuditTable` — included/excluded docs with reasons
3. `VersionHistoryPanel` — diff viewer, restore button
4. `ChatDebugPanel` — toggle-able sidebar in chat
5. `MemoryBrowser` — full CRUD table for knowledge entries

---

## Success Metrics

- Developer can answer "what prompt does my agent get?" in <30 seconds
- Developer can see why a knowledge doc wasn't included
- Developer can restore previous prompt version without SQL
- Developer can diagnose agent misbehavior from chat UI

---

## Open Questions

1. **Token counting accuracy** — Use tiktoken or rough estimate (chars/4)?
2. **Debug mode storage** — Store full prompts or just hashes?
3. **Permission gating** — Should all users see debug info or just admins?

---

## Next Steps

1. Review with John
2. Prioritize P1 features
3. Build `prompt-preview` endpoint first (enables everything else)
