# Agent Chat Tabs - Implementation Plan

**Date:** 2026-01-31
**Status:** Planning → Implementation

## Overview

Add multi-agent chat support to the right sidebar with a tabbed interface.

## UI Design

```
┌─────────────────────────────────────┐
│ [🤖 Stella ▼] [🔧 Moltbot] [+ Add]  │  ← Tabs
├─────────────────────────────────────┤
│                                     │
│  Chat messages...                   │
│                                     │
│                                     │
├─────────────────────────────────────┤
│ [Type message...]            [Send] │
└─────────────────────────────────────┘
```

## Tab Features

- Active tab highlighted
- Unread dot/count on inactive tabs  
- Click to switch agent context
- `[+ Add]` opens agent picker modal
- Right-click tab → close / settings
- Dropdown arrow on active tab → quick agent picker
- Tabs persist in localStorage

## Data Model

```typescript
interface ChatTab {
  id: string;           // unique tab id
  agentId: string;      // which agent
  agentName: string;    // display name
  agentIcon?: string;   // emoji or avatar
  sessionId?: string;   // session for this chat
  unreadCount: number;  // unread messages
  lastActivity: Date;   // for sorting
}

// Store in localStorage
interface ChatTabsState {
  tabs: ChatTab[];
  activeTabId: string;
}
```

## Implementation Steps

### Phase 1: Basic Tab UI
1. Create `ChatTabs` component with tab bar
2. Add tab state management (useState + localStorage)
3. Wire up tab switching
4. Style active/inactive tabs

### Phase 2: Agent Integration  
1. Fetch available agents on mount
2. "Add" button opens agent picker
3. Connect tab to agent's chat endpoint
4. Maintain separate message history per tab

### Phase 3: Real-time Features
1. Unread count tracking
2. Auto-open tab when agent messages you
3. Tab close confirmation if unread
4. Notification sounds (optional)

### Phase 4: Polish
1. Tab overflow handling (scroll or dropdown)
2. Drag to reorder tabs
3. Tab context menu (close, close others, settings)
4. Agent status indicator on tab

## Open Questions

1. **One session per agent, or multiple sessions with same agent?**
   - Leaning: One session per agent for simplicity

2. **Should tabs auto-open when an agent messages you?**
   - Leaning: Yes, with visual indicator

3. **Limit on open tabs?**
   - Leaning: Soft limit (10?), can close to make room

4. **Context auto-keying?**
   - TBD: Should context snapshots auto-generate keys or require manual?

## Related Work

- Context integration for Stellabot and Moltbot
- Dashboard machine cards → clickable to open machine

## Files to Modify

- `client/src/components/GlobalChatSidebar.tsx` - Add tabs
- `client/src/hooks/use-chat-tabs.ts` - New hook for tab state
- `client/src/components/ChatTabBar.tsx` - New tab bar component
- `client/src/components/AgentPicker.tsx` - New agent selection modal
