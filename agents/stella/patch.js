const fs = require('fs');
const path = require('path');

const filePath = path.join(process.env.HOME, 'e2e/stellabot/server/services/tool-loop.ts');
let code = fs.readFileSync(filePath, 'utf8');

const target = `// Log tool execution with timing
          const toolLog = logger.toolStart(block.name, block.input as Record<string, unknown>);
          emit({ type: 'tool_start', tool: block.name, input: block.input });
          try {
            const result = await executeTool(toolCtx, block.name, block.input as Record<string, unknown>);

            // Capture screenshots so callers (group-threads) can persist them to R2/DB and render in UI
            if (typeof result === 'object' && result && (result as any).imageBase64) {
              capturedScreenshots.push({
                base64: String((result as any).imageBase64),
                mediaType: String((result as any).mediaType || 'image/png'),
              });
            }

            await toolLog.success(typeof result === 'string' ? result : JSON.stringify(result));
            emit({ type: 'tool_end', tool: block.name, success: true });
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: buildToolResultContent(result),
            });
          } catch (toolErr: any) {
            await toolLog.error(toolErr.message || String(toolErr));
            emit({ type: 'tool_end', tool: block.name, success: false, error: toolErr.message });
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: \`Error: \${toolErr.message || toolErr}\`,
              is_error: true,
            });
          }`;

const replacement = `// Log tool execution with timing
          const toolStartTime = Date.now();
          const timestamp = new Date().toLocaleTimeString('en-US', {
            hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' 
          });
          const inputStr = JSON.stringify(block.input);
          const displayInput = inputStr.length > 200 ? inputStr.substring(0, 200) + '...' : inputStr;
          
          const toolLog = logger.toolStart(block.name, block.input as Record<string, unknown>);
          emit({ type: 'tool_start', tool: block.name, input: block.input });
          try {
            const result = await executeTool(toolCtx, block.name, block.input as Record<string, unknown>);

            // Capture screenshots so callers (group-threads) can persist them to R2/DB and render in UI
            if (typeof result === 'object' && result && (result as any).imageBase64) {
              capturedScreenshots.push({
                base64: String((result as any).imageBase64),
                mediaType: String((result as any).mediaType || 'image/png'),
              });
            }

            const resultText = typeof result === 'string' ? result : JSON.stringify(result);
            const displayResult = resultText.length > 300 ? resultText.substring(0, 300) + '...' : resultText;
            const durationSec = ((Date.now() - toolStartTime) / 1000).toFixed(1);

            toolCallLog.push(\`[Tool: \${block.name}] \${timestamp}\\nInput: \${displayInput}\\nResult: \${displayResult}\\nDuration: \${durationSec}s ✓\`);

            await toolLog.success(resultText);
            emit({ type: 'tool_end', tool: block.name, success: true });
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: buildToolResultContent(result),
            });
          } catch (toolErr: any) {
            const errorText = \`Error: \${toolErr.message || toolErr}\`;
            const displayResult = errorText.length > 300 ? errorText.substring(0, 300) + '...' : errorText;
            const durationSec = ((Date.now() - toolStartTime) / 1000).toFixed(1);

            toolCallLog.push(\`[Tool: \${block.name}] \${timestamp}\\nInput: \${displayInput}\\nResult: \${displayResult}\\nDuration: \${durationSec}s ✗\`);

            await toolLog.error(toolErr.message || String(toolErr));
            emit({ type: 'tool_end', tool: block.name, success: false, error: toolErr.message });
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: errorText,
              is_error: true,
            });
          }`;

code = code.replace(target, replacement);
fs.writeFileSync(filePath, code);
