const fs = require('fs');
const file = './server/routes/soft-agent-chat.ts';
let code = fs.readFileSync(file, 'utf8');

const regex = /async function executeBrowserToolViaMachineService\([\s\S]*?body: Record<string, unknown> \| null = null;\s*const queryParams = new URLSearchParams\(\);/m;

code = code.replace(regex, (match) => {
  return match + `\n
    // Server-side sticky targetId: inject if missing
    if (!input.targetId && ctx && ctx.browserTargetId) {
      console.log(\`[SoftAgent/Browser] Injecting sticky targetId \${ctx.browserTargetId} into \${toolName}\`);
      input.targetId = ctx.browserTargetId;
    }
  `;
});

const regex2 = /if \(toolName === 'browser_snapshot'\) \{/m;
code = code.replace(regex2, (match) => {
  return `// Track returned targetId for sticky sessions
    if (data.targetId && ctx) {
      ctx.browserTargetId = data.targetId;
    }
    
    ` + match;
});

fs.writeFileSync(file, code);
