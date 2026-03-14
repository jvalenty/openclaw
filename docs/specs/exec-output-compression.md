# Exec Output Compression Spec

**Status:** Draft  
**Author:** Stella  
**Date:** 2026-02-21  
**Inspired by:** [rtk-ai/rtk](https://github.com/rtk-ai/rtk)

## Problem

Soft agents using Machine Service exec burn excessive tokens on verbose command output:
- `git status` returns 20+ lines when 1 line suffices
- `npm test` returns 200+ lines when only failures matter
- `ls -la` returns permission/date noise when file names suffice
- Build logs include progress bars, spinners, redundant info

RTK demonstrates 60-90% savings on common dev commands. We should apply similar compression at the Machine Service layer.

## Goals

1. **60-80% token reduction** on common dev commands
2. **Zero config for agents** — compression happens automatically
3. **Opt-out available** — full output when needed
4. **Savings tracking** — measure and report compression stats

## Non-Goals

- Replacing RTK for Claude Code users (they can use RTK directly)
- Compressing arbitrary binary output
- Real-time streaming compression (batch only for v1)

---

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Soft Agent  │────▶│  Machine Service │────▶│  Shell Command  │
│  (Claude)   │     │    /exec         │     │                 │
└─────────────┘     └────────┬─────────┘     └────────┬────────┘
                             │                        │
                             │◀───────────────────────┘
                             │     raw output
                             ▼
                    ┌──────────────────┐
                    │ Output Compressor│
                    │  (by command)    │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ Compressed Output│
                    │ + savings stats  │
                    └──────────────────┘
```

---

## API Changes

### Exec Endpoint

```typescript
POST /exec
{
  "command": "npm test",
  "cwd": "/path/to/project",
  
  // NEW: Compression options
  "compress": "auto" | "minimal" | "none",  // default: "auto"
  "maxOutputChars": 50000,                   // truncation limit
  "includeStats": true                       // include savings in response
}
```

### Response

```typescript
{
  "ok": true,
  "stdout": "FAIL: 2/47 tests\n  ✗ auth.test.ts:42 - expected 200, got 401\n  ✗ user.test.ts:88 - timeout",
  "stderr": "",
  "exitCode": 1,
  
  // NEW: Compression stats
  "compression": {
    "originalChars": 12847,
    "compressedChars": 156,
    "savedChars": 12691,
    "savedPercent": 98.8,
    "compressor": "test-failures"
  }
}
```

---

## Compressors

### 1. Git Compressor

| Command | Raw Output | Compressed Output | Savings |
|---------|-----------|-------------------|---------|
| `git status` | 25 lines, file lists, hints | `M:3 A:1 D:0 ?:2` | 85% |
| `git push` | 15 lines, progress, refs | `ok ✓ main → origin/main` | 92% |
| `git pull` | 20 lines, merge info | `ok ✓ +3 files, 47 insertions` | 90% |
| `git log` | Full commits | `abc123 feat: add auth (2h ago)` | 75% |
| `git diff` | Full diff | Grouped by file, ±line counts | 60% |

**Implementation:**

```typescript
const gitCompressor = {
  patterns: [/^git\s+/],
  
  compress(command: string, output: string): string {
    const subcommand = command.split(/\s+/)[1];
    
    switch (subcommand) {
      case 'status':
        return compressGitStatus(output);
      case 'push':
      case 'pull':
        return compressGitPushPull(output);
      case 'log':
        return compressGitLog(output);
      case 'diff':
        return compressGitDiff(output);
      default:
        return output; // passthrough
    }
  }
};

function compressGitStatus(output: string): string {
  if (output.includes('nothing to commit')) {
    return 'clean ✓';
  }
  
  const modified = (output.match(/^\s*M\s+/gm) || []).length;
  const added = (output.match(/^\s*A\s+/gm) || []).length;
  const deleted = (output.match(/^\s*D\s+/gm) || []).length;
  const untracked = (output.match(/^\?\?\s+/gm) || []).length;
  
  const parts = [];
  if (modified) parts.push(`M:${modified}`);
  if (added) parts.push(`A:${added}`);
  if (deleted) parts.push(`D:${deleted}`);
  if (untracked) parts.push(`?:${untracked}`);
  
  // Include file names if few enough
  if (modified + added + deleted + untracked <= 5) {
    const files = extractChangedFiles(output);
    return `${parts.join(' ')} [${files.join(', ')}]`;
  }
  
  return parts.join(' ');
}

function compressGitPushPull(output: string): string {
  if (output.includes('error') || output.includes('fatal')) {
    // Keep errors verbose
    return output.split('\n').filter(l => 
      l.includes('error') || l.includes('fatal') || l.includes('hint')
    ).join('\n');
  }
  
  const branch = output.match(/-> ([\w\/-]+)/)?.[1] || 'main';
  return `ok ✓ ${branch}`;
}
```

### 2. Test Compressor

Supports: npm test, jest, vitest, pytest, cargo test, go test

**Strategy:** Only show failures. Passes are noise.

```typescript
const testCompressor = {
  patterns: [
    /npm\s+test/,
    /npx\s+(jest|vitest)/,
    /pytest/,
    /cargo\s+test/,
    /go\s+test/,
  ],
  
  compress(command: string, output: string): string {
    // Detect test framework
    const framework = detectTestFramework(output);
    
    // Extract failure info
    const failures = extractTestFailures(output, framework);
    
    if (failures.length === 0) {
      const passCount = countPassingTests(output, framework);
      return `ok ✓ ${passCount} tests passed`;
    }
    
    const total = countTotalTests(output, framework);
    const header = `FAIL: ${failures.length}/${total} tests\n`;
    
    const failureLines = failures.map(f => 
      `  ✗ ${f.file}:${f.line} - ${f.message}`
    ).join('\n');
    
    return header + failureLines;
  }
};
```

**Example:**

Raw (203 lines):
```
> jest --coverage

PASS src/utils/format.test.ts
PASS src/utils/validate.test.ts
FAIL src/auth/login.test.ts
  ● Auth › login › should return token
    expect(received).toBe(expected)
    Expected: 200
    Received: 401
      at Object.<anonymous> (src/auth/login.test.ts:42:18)
...
Test Suites: 1 failed, 46 passed, 47 total
Tests:       1 failed, 89 passed, 90 total
```

Compressed (3 lines):
```
FAIL: 1/90 tests
  ✗ src/auth/login.test.ts:42 - expected 200, got 401
```

### 3. File Listing Compressor

```typescript
const lsCompressor = {
  patterns: [/^ls\s/, /^find\s/, /^tree\s/],
  
  compress(command: string, output: string): string {
    const lines = output.trim().split('\n');
    
    // For ls -la, strip permissions, dates, sizes
    if (command.includes('-l')) {
      return lines.map(line => {
        // "drwxr-xr-x 15 user staff 480 Jan 23 10:00 dirname"
        // becomes "📁 dirname" or "📄 filename"
        const match = line.match(/^([d-]).*\s+(\S+)$/);
        if (match) {
          const icon = match[1] === 'd' ? '📁' : '📄';
          return `${icon} ${match[2]}`;
        }
        return line;
      }).join('\n');
    }
    
    // For plain ls with many files, group by extension
    if (lines.length > 20) {
      return groupFilesByExtension(lines);
    }
    
    return output;
  }
};

function groupFilesByExtension(files: string[]): string {
  const groups: Record<string, string[]> = {};
  
  for (const file of files) {
    const ext = file.split('.').pop() || 'other';
    (groups[ext] ||= []).push(file);
  }
  
  return Object.entries(groups)
    .map(([ext, files]) => `${ext}: ${files.length} files`)
    .join('\n');
}
```

### 4. Build/Lint Compressor

**Strategy:** Errors and warnings only. Strip progress, success messages.

```typescript
const buildCompressor = {
  patterns: [
    /npm\s+run\s+build/,
    /tsc/,
    /eslint/,
    /prettier/,
    /cargo\s+build/,
    /go\s+build/,
  ],
  
  compress(command: string, output: string): string {
    const lines = output.split('\n');
    
    // Keep only error/warning lines
    const important = lines.filter(line => 
      /error|warn|fail|exception/i.test(line) ||
      /^\s*at\s+/.test(line) || // stack traces
      /:\d+:\d+/.test(line)     // file:line:col references
    );
    
    if (important.length === 0) {
      return 'ok ✓ build successful';
    }
    
    // Group by file
    return groupErrorsByFile(important);
  }
};
```

### 5. Log Compressor

**Strategy:** Deduplicate repeated lines, show counts.

```typescript
const logCompressor = {
  patterns: [/docker\s+logs/, /kubectl\s+logs/, /tail\s+-f/],
  
  compress(command: string, output: string): string {
    const lines = output.split('\n');
    const counts = new Map<string, number>();
    const order: string[] = [];
    
    for (const line of lines) {
      // Normalize timestamps for comparison
      const normalized = line.replace(
        /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/g, 
        '[TIME]'
      );
      
      if (counts.has(normalized)) {
        counts.set(normalized, counts.get(normalized)! + 1);
      } else {
        counts.set(normalized, 1);
        order.push(normalized);
      }
    }
    
    return order.map(line => {
      const count = counts.get(line)!;
      return count > 1 ? `(×${count}) ${line}` : line;
    }).join('\n');
  }
};
```

### 6. Package Manager Compressor

```typescript
const packageCompressor = {
  patterns: [
    /npm\s+(install|i|ci)/,
    /yarn\s+(install|add)/,
    /pnpm\s+(install|add)/,
    /pip\s+install/,
    /cargo\s+(build|install)/,
  ],
  
  compress(command: string, output: string): string {
    // Strip progress bars, download indicators
    const lines = output.split('\n').filter(line =>
      !line.includes('⠋') && 
      !line.includes('⠙') &&
      !line.includes('downloading') &&
      !line.match(/\d+%/) &&
      line.trim().length > 0
    );
    
    // Count packages
    const added = (output.match(/added \d+ packages?/g) || []).join(', ');
    
    if (added) {
      return `ok ✓ ${added}`;
    }
    
    // Keep warnings/errors
    const important = lines.filter(l => /warn|error|deprecated/i.test(l));
    if (important.length > 0) {
      return important.slice(0, 10).join('\n');
    }
    
    return 'ok ✓ installed';
  }
};
```

---

## File Reading Compression

### Local Read Endpoint Enhancement

```typescript
POST /files/read
{
  "path": "/path/to/file.ts",
  
  // NEW: Compression modes
  "mode": "full" | "signatures" | "structure" | "relevant",
  "relevantQuery": "authentication",  // for mode=relevant
  "maxLines": 500
}
```

### Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `full` | Complete file content | Default, editing |
| `signatures` | Function/class signatures only | Understanding API |
| `structure` | Outline with line numbers | Navigation |
| `relevant` | Lines matching query + context | Searching |

### Signatures Mode

```typescript
function extractSignatures(content: string, language: string): string {
  const lines = content.split('\n');
  const signatures: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Function declarations
    if (/^(export\s+)?(async\s+)?function\s+\w+/.test(line) ||
        /^(export\s+)?const\s+\w+\s*=\s*(async\s+)?\(/.test(line)) {
      signatures.push(`L${i + 1}: ${line.trim()}`);
    }
    
    // Class declarations
    if (/^(export\s+)?class\s+\w+/.test(line)) {
      signatures.push(`L${i + 1}: ${line.trim()}`);
    }
    
    // Method declarations (indented)
    if (/^\s+(async\s+)?\w+\s*\([^)]*\)\s*[:{]/.test(line)) {
      signatures.push(`L${i + 1}: ${line.trim()}`);
    }
    
    // Type/Interface declarations
    if (/^(export\s+)?(type|interface)\s+\w+/.test(line)) {
      signatures.push(`L${i + 1}: ${line.trim()}`);
    }
  }
  
  return signatures.join('\n');
}
```

**Example:**

Full file (847 lines) → Signatures (43 lines):
```
L1: export interface User { ... }
L15: export class AuthService {
L23:   async login(email: string, password: string): Promise<Token>
L45:   async logout(token: string): Promise<void>
L52:   async refresh(token: string): Promise<Token>
L78: export function validateToken(token: string): boolean
...
```

---

## Savings Tracking

### Database Schema

```sql
CREATE TABLE exec_compression_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  agent_id UUID REFERENCES agents(id),
  command_type VARCHAR(50) NOT NULL,  -- 'git', 'test', 'build', etc.
  compressor VARCHAR(50),
  original_chars INTEGER NOT NULL,
  compressed_chars INTEGER NOT NULL,
  saved_chars INTEGER NOT NULL,
  saved_percent DECIMAL(5,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_compression_stats_org ON exec_compression_stats(org_id, created_at);
CREATE INDEX idx_compression_stats_agent ON exec_compression_stats(agent_id, created_at);
```

### API Endpoints

```typescript
// Get compression savings summary
GET /api/compression/stats?orgId=xxx&period=7d

Response:
{
  "period": "7d",
  "totalCommands": 1247,
  "totalOriginalChars": 4_521_890,
  "totalCompressedChars": 892_456,
  "totalSavedChars": 3_629_434,
  "overallSavingsPercent": 80.3,
  "byCommandType": {
    "git": { commands: 423, savedPercent: 87.2 },
    "test": { commands: 156, savedPercent: 91.5 },
    "build": { commands: 89, savedPercent: 78.4 },
    "ls": { commands: 312, savedPercent: 72.1 }
  },
  "estimatedTokensSaved": 907_358,  // chars / 4
  "estimatedCostSaved": "$2.72"     // at $3/1M tokens
}
```

---

## Configuration

### Per-Org Settings

```typescript
// In org settings or agent config
{
  "execCompression": {
    "enabled": true,
    "defaultMode": "auto",      // auto | minimal | none
    "maxOutputChars": 50000,
    "trackStats": true,
    
    // Per-command overrides
    "overrides": {
      "git diff": "none",       // always show full diffs
      "cat": "none"             // always show full files
    }
  }
}
```

### Agent-Level Override

```typescript
// Agent can request specific compression
{
  "command": "npm test",
  "compress": "none"  // override org default
}
```

---

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- [ ] Add compression options to exec endpoint
- [ ] Implement compressor interface and registry
- [ ] Git compressor (status, push, pull, log)
- [ ] Basic stats tracking

### Phase 2: Dev Tool Compressors (Week 2)
- [ ] Test compressor (jest, vitest, pytest, cargo test)
- [ ] Build/lint compressor (tsc, eslint, cargo build)
- [ ] Package manager compressor (npm, yarn, pip)
- [ ] File listing compressor (ls, find, tree)

### Phase 3: File Reading (Week 3)
- [ ] Signatures mode for local_read
- [ ] Structure mode
- [ ] Relevant mode with context

### Phase 4: Analytics & UI (Week 4)
- [ ] Compression stats API
- [ ] Savings dashboard in Settings
- [ ] Per-agent savings breakdown

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Average compression ratio | > 70% |
| Commands with compression | > 80% of dev commands |
| Token cost reduction | > 50% on coding sessions |
| Agent task completion | No regression |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Over-compression loses context | Agent makes mistakes | Conservative defaults, easy opt-out |
| Compressor bugs | Wrong output | Extensive test suite per compressor |
| Performance overhead | Slow exec | Lazy loading, async compression |
| Framework detection fails | Wrong compression | Fallback to passthrough |

---

## Open Questions

1. **Streaming support?** — Should compression work on streaming output or batch only?
2. **Agent hints?** — Should agents be able to request "I need full output for this"?
3. **Learning?** — Should we track which compressions agents override and adjust?
