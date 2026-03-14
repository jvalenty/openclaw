# Shared Context & Self-Learning Architecture

## Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CONTEXT BRAIN                                    │
│                                                                         │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐ │
│  │   INGEST    │ → │    INDEX    │ → │   RETRIEVE  │ → │   DELIVER   │ │
│  │             │   │             │   │             │   │             │ │
│  │ • Files     │   │ • Chunk     │   │ • Query     │   │ • To agent  │ │
│  │ • SQL       │   │ • Embed     │   │ • Rank      │   │ • Formatted │ │
│  │ • Convos    │   │ • Store     │   │ • Filter    │   │ • Relevant  │ │
│  │ • Feedback  │   │ • Link      │   │ • Expand    │   │             │ │
│  └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘ │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     AUTO-UPDATE DAEMON                           │   │
│  │  • Watch file changes → Re-index                                 │   │
│  │  • Watch DB changes → Update schema knowledge                    │   │
│  │  • Prune stale entries → Keep context fresh                      │   │
│  │  • Learn from feedback → Improve retrieval                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Core Concepts

### 1. Context Types

| Type | Description | Example |
|------|-------------|---------|
| **Team Context** | Shared org knowledge | Decisions, preferences, project state |
| **Code Context** | File system indexing | Source files, configs, docs |
| **Data Context** | SQL schema + samples | Tables, relationships, common queries |
| **Conversation Context** | Past interactions | What worked, what didn't |
| **Learning Context** | Self-improvement | Patterns, corrections, feedback |

### 2. Context Scopes

```
┌─────────────────────────────────────────┐
│              GLOBAL                      │  ← Platform-wide (rare)
├─────────────────────────────────────────┤
│           ORGANIZATION                   │  ← Team shared context
├─────────────────────────────────────────┤
│             MACHINE                      │  ← Local file/code context
├─────────────────────────────────────────┤
│              AGENT                       │  ← Agent-specific memory
├─────────────────────────────────────────┤
│             SESSION                      │  ← Current conversation
└─────────────────────────────────────────┘
```

## Database Schema

### Context Documents (what we store)

```sql
CREATE TABLE context_documents (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  
  -- Scope
  organization_id VARCHAR REFERENCES orgs(id) ON DELETE CASCADE,
  machine_id VARCHAR REFERENCES machines(id) ON DELETE SET NULL,
  agent_id VARCHAR REFERENCES agents(id) ON DELETE SET NULL,
  
  -- Source
  source_type VARCHAR(50) NOT NULL, -- 'file', 'sql_schema', 'conversation', 'manual', 'learned'
  source_path TEXT, -- file path, table name, session id, etc.
  source_hash VARCHAR(64), -- for change detection
  
  -- Content
  title VARCHAR(500),
  content TEXT NOT NULL,
  content_type VARCHAR(50) DEFAULT 'text', -- 'text', 'code', 'sql', 'markdown', 'json'
  language VARCHAR(50), -- for code: 'typescript', 'python', etc.
  
  -- Metadata
  metadata JSONB DEFAULT '{}', -- flexible: line numbers, function names, etc.
  tags VARCHAR[] DEFAULT '{}', -- searchable tags
  
  -- Embeddings (for vector search)
  embedding VECTOR(1536), -- OpenAI ada-002 dimension
  embedding_model VARCHAR(100) DEFAULT 'text-embedding-ada-002',
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  indexed_at TIMESTAMP,
  expires_at TIMESTAMP, -- optional TTL
  
  -- Quality signals
  access_count INTEGER DEFAULT 0,
  usefulness_score FLOAT DEFAULT 0.5, -- 0-1, updated by feedback
  last_accessed_at TIMESTAMP
);

CREATE INDEX idx_context_docs_org ON context_documents(organization_id);
CREATE INDEX idx_context_docs_machine ON context_documents(machine_id);
CREATE INDEX idx_context_docs_source ON context_documents(source_type, source_path);
CREATE INDEX idx_context_docs_tags ON context_documents USING GIN(tags);
CREATE INDEX idx_context_docs_embedding ON context_documents USING ivfflat(embedding vector_cosine_ops);
```

### Context Chunks (for large documents)

```sql
CREATE TABLE context_chunks (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  document_id VARCHAR REFERENCES context_documents(id) ON DELETE CASCADE,
  
  -- Position
  chunk_index INTEGER NOT NULL,
  start_offset INTEGER,
  end_offset INTEGER,
  
  -- Content
  content TEXT NOT NULL,
  token_count INTEGER,
  
  -- Embedding
  embedding VECTOR(1536),
  
  -- Metadata
  metadata JSONB DEFAULT '{}', -- line numbers, function scope, etc.
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_chunks_document ON context_chunks(document_id);
CREATE INDEX idx_chunks_embedding ON context_chunks USING ivfflat(embedding vector_cosine_ops);
```

### Team Memory (high-level shared knowledge)

```sql
CREATE TABLE team_memory (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR REFERENCES orgs(id) ON DELETE CASCADE NOT NULL,
  
  -- What
  memory_type VARCHAR(50) NOT NULL, -- 'decision', 'preference', 'fact', 'lesson', 'goal'
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  
  -- Who
  created_by_agent_id VARCHAR REFERENCES agents(id) ON DELETE SET NULL,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  
  -- Importance
  importance VARCHAR(20) DEFAULT 'normal', -- 'critical', 'high', 'normal', 'low'
  confidence FLOAT DEFAULT 1.0, -- 0-1, how certain
  
  -- Validity
  valid_from TIMESTAMP DEFAULT NOW(),
  valid_until TIMESTAMP, -- null = forever
  supersedes_id VARCHAR REFERENCES team_memory(id), -- if this replaces older memory
  
  -- Embedding
  embedding VECTOR(1536),
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP
);

CREATE INDEX idx_team_memory_org ON team_memory(organization_id);
CREATE INDEX idx_team_memory_type ON team_memory(memory_type);
CREATE INDEX idx_team_memory_embedding ON team_memory USING ivfflat(embedding vector_cosine_ops);
```

### Learning Feedback (self-improvement)

```sql
CREATE TABLE learning_feedback (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR REFERENCES orgs(id) ON DELETE CASCADE,
  
  -- What was retrieved
  query TEXT NOT NULL,
  query_embedding VECTOR(1536),
  retrieved_doc_ids VARCHAR[], -- what we returned
  
  -- Context
  agent_id VARCHAR REFERENCES agents(id) ON DELETE SET NULL,
  session_id VARCHAR,
  
  -- Feedback
  feedback_type VARCHAR(50) NOT NULL, -- 'helpful', 'not_helpful', 'missing', 'wrong', 'outdated'
  feedback_score FLOAT, -- -1 to 1
  feedback_text TEXT, -- optional explanation
  
  -- Correction (for 'wrong' or 'missing')
  correct_doc_ids VARCHAR[], -- what should have been returned
  suggested_content TEXT, -- what was actually needed
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_feedback_org ON learning_feedback(organization_id);
CREATE INDEX idx_feedback_type ON learning_feedback(feedback_type);
CREATE INDEX idx_feedback_query ON learning_feedback USING ivfflat(query_embedding vector_cosine_ops);
```

### Index Jobs (auto-updating)

```sql
CREATE TABLE index_jobs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  
  -- Scope
  organization_id VARCHAR REFERENCES orgs(id) ON DELETE CASCADE,
  machine_id VARCHAR REFERENCES machines(id) ON DELETE CASCADE,
  
  -- Job type
  job_type VARCHAR(50) NOT NULL, -- 'full_reindex', 'incremental', 'single_file', 'sql_schema'
  
  -- Target
  target_path TEXT, -- file path, table name, or glob pattern
  target_type VARCHAR(50), -- 'file', 'directory', 'sql_table', 'sql_schema'
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
  progress FLOAT DEFAULT 0, -- 0-1
  
  -- Results
  documents_created INTEGER DEFAULT 0,
  documents_updated INTEGER DEFAULT 0,
  documents_deleted INTEGER DEFAULT 0,
  chunks_created INTEGER DEFAULT 0,
  error TEXT,
  
  -- Timing
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  
  -- Schedule (for recurring)
  cron_expression VARCHAR(100), -- e.g., '0 * * * *' for hourly
  next_run_at TIMESTAMP
);

CREATE INDEX idx_index_jobs_status ON index_jobs(status);
CREATE INDEX idx_index_jobs_machine ON index_jobs(machine_id);
```

## Mini-Model Dispatch for Context

The orchestrator uses a mini-model to decide:
1. **What context to fetch** before routing to specialists
2. **Which scope to search** (org, machine, agent)
3. **How much context** to include (token budget)

```typescript
interface ContextDispatchConfig {
  // Model for context decisions
  contextModel: string; // 'gpt-4o-mini', 'claude-3-haiku'
  
  // Token budgets
  maxContextTokens: number; // max tokens to include
  reserveTokens: number; // leave room for response
  
  // Search config
  searchScopes: ('organization' | 'machine' | 'agent' | 'session')[];
  searchTypes: ('code' | 'docs' | 'memory' | 'sql' | 'conversation')[];
  
  // Retrieval
  topK: number; // max docs to retrieve
  minScore: number; // minimum similarity threshold
  
  // Auto-expand
  expandRelated: boolean; // fetch related chunks
  expandDepth: number; // how many hops
}
```

## Auto-Update Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  FILE WATCH  │ ──→ │   DEBOUNCE   │ ──→ │   INDEX JOB  │
│              │     │   (5 sec)    │     │              │
│ • inotify    │     │              │     │ • Chunk file │
│ • polling    │     │              │     │ • Embed      │
└──────────────┘     └──────────────┘     │ • Store      │
                                          └──────────────┘
                                                 │
                                                 ↓
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  SQL WATCH   │ ──→ │  SCHEMA DIFF │ ──→ │ UPDATE DOCS  │
│              │     │              │     │              │
│ • DDL hooks  │     │ • New tables │     │ • Schema doc │
│ • pg_notify  │     │ • Changed    │     │ • Examples   │
└──────────────┘     └──────────────┘     └──────────────┘
                                                 │
                                                 ↓
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  FEEDBACK    │ ──→ │   ANALYZE    │ ──→ │   ADJUST     │
│              │     │              │     │              │
│ • Usage logs │     │ • Patterns   │     │ • Weights    │
│ • Explicit   │     │ • Gaps       │     │ • Prune old  │
└──────────────┘     └──────────────┘     └──────────────┘
```

## API Endpoints

```typescript
// Context Management
POST   /api/context/ingest          // Add new content
POST   /api/context/query           // Search context (returns relevant chunks)
GET    /api/context/documents       // List documents
DELETE /api/context/documents/:id   // Remove document

// Team Memory
POST   /api/memory/remember         // Add team memory
GET    /api/memory/recall           // Search memories
PUT    /api/memory/:id              // Update memory
DELETE /api/memory/:id              // Forget

// Learning
POST   /api/learning/feedback       // Submit feedback on retrieval
GET    /api/learning/stats          // Learning metrics

// Indexing
POST   /api/index/start             // Start index job
GET    /api/index/jobs              // List jobs
GET    /api/index/jobs/:id          // Job status
POST   /api/index/schedule          // Schedule recurring index
```

## Integration with Orchestrator

When a request comes in:

```
1. User Input
      ↓
2. Mini-Model analyzes:
   - What context is needed?
   - Which specialists?
   - Token budget?
      ↓
3. Context Fetch:
   - Vector search org context
   - Pull relevant code/docs
   - Include team memory
      ↓
4. Dispatch to Specialist(s):
   - Include fetched context
   - Route based on skills
      ↓
5. Specialist executes with context
      ↓
6. Response + Learning:
   - Log what context was used
   - Collect implicit/explicit feedback
   - Update usefulness scores
```

## Implementation Phases

### Phase 1: Core Schema + Basic Retrieval
- [ ] Create tables with pgvector extension
- [ ] Basic document ingestion API
- [ ] Simple vector search
- [ ] Integration with orchestrator dispatch

### Phase 2: Auto-Indexing
- [ ] File watcher daemon (on machines)
- [ ] SQL schema introspection
- [ ] Incremental indexing
- [ ] Change detection (hash-based)

### Phase 3: Team Memory
- [ ] Memory CRUD API
- [ ] Memory retrieval in context
- [ ] Importance ranking
- [ ] Supersession logic

### Phase 4: Self-Learning
- [ ] Feedback collection
- [ ] Usefulness score updates
- [ ] Query pattern analysis
- [ ] Automatic pruning

### Phase 5: Advanced Features
- [ ] Multi-hop context expansion
- [ ] Cross-org context (with permissions)
- [ ] Context versioning
- [ ] Semantic deduplication
