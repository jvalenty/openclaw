const fs = require('fs');
const file = './server/routes/soft-agent-chat.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/ctx\?: \{ orgId: string; agentId\?: string \},/g, 'ctx?: ToolContext,');
code = code.replace(/ctx\.browserTargetId/g, '(ctx as ToolContext).browserTargetId');

fs.writeFileSync(file, code);
