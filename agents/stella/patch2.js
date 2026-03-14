const fs = require('fs');
const path = require('path');

const filePath = path.join(process.env.HOME, 'e2e/stellabot/client/src/components/GroupThreadChat.tsx');
let code = fs.readFileSync(filePath, 'utf8');

const targetImport = `import { Button } from '@/components/ui/button';`;
const replacementImport = `import { Button } from '@/components/ui/button';
import { ToolCallGroup, parseToolCalls } from './ToolCallBlock';`;

code = code.replace(targetImport, replacementImport);

const targetRender = `{/* Tool calls (collapsed), when present in metadata */}
        {isAgent && toolCallLog.length > 0 && (
          <details className="mb-2 text-xs">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-700 flex items-center gap-1">
              <span className="text-[10px]">🤔</span>
              <span>Tools ({toolCallLog.length})</span>
            </summary>
            <div className="mt-1 pl-3 border-l-2 border-slate-200 text-slate-600 space-y-1">
              {toolCallLog.slice(-10).map((line, i) => (
                <div key={i} className="font-mono text-[11px] whitespace-pre-wrap break-words">{line}</div>
              ))}
            </div>
          </details>
        )}`;

const replacementRender = `{/* Tool calls (collapsed), when present in metadata */}
        {isAgent && toolCallLog.length > 0 && (() => {
          // Parse toolCallLog array of formatted strings back into ParsedToolCall format
          const joinedLogs = toolCallLog.join('\\n\\n');
          const { toolCalls } = parseToolCalls(joinedLogs);
          if (toolCalls.length > 0) {
            return <ToolCallGroup toolCalls={toolCalls} defaultExpanded={false} />;
          }
          
          // Fallback if they didn't match the regex pattern (e.g. old messages)
          return (
            <details className="mb-2 text-xs">
              <summary className="cursor-pointer text-slate-500 hover:text-slate-700 flex items-center gap-1">
                <span className="text-[10px]">🤔</span>
                <span>Tools ({toolCallLog.length})</span>
              </summary>
              <div className="mt-1 pl-3 border-l-2 border-slate-200 text-slate-600 space-y-1">
                {toolCallLog.slice(-10).map((line, i) => (
                  <div key={i} className="font-mono text-[11px] whitespace-pre-wrap break-words">{line}</div>
                ))}
              </div>
            </details>
          );
        })()}`;

code = code.replace(targetRender, replacementRender);
fs.writeFileSync(filePath, code);
