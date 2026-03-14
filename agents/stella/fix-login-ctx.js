const fs = require('fs');
const file = './server/routes/soft-agent-chat.ts';
let code = fs.readFileSync(file, 'utf8');

const loginReplacement = `    const structuredResponse = {
      status: "success",
      service: service,
      method: result.method,
      message: result.message,
      targetId: result.targetId || undefined
    };

    if (result.targetId) {
      (ctx as ToolContext).browserTargetId = result.targetId;
    }

    // Always take a screenshot after login`;

code = code.replace(/const structuredResponse = \{[\s\S]*?\}\;\s*\/\/ Always take a screenshot after login/, loginReplacement);

const failLoginReplace = `    if (!result.success) {
      if (result.targetId) {
        (ctx as ToolContext).browserTargetId = result.targetId;
      }
      const failResponse = {`;

code = code.replace(/if \(\!result\.success\) \{\s*const failResponse = \{/, failLoginReplace);

fs.writeFileSync(file, code);
