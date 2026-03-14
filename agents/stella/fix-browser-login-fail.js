const fs = require('fs');
const file = './server/routes/soft-agent-chat.ts';
let code = fs.readFileSync(file, 'utf8');

const failReplace = `    if (!result.success) {
      const failResponse = {
        status: "failed",
        service: service,
        message: result.message,
        targetId: result.targetId || undefined
      };
      
      if (result.targetId) {
        try {
          const shot = await executeBrowserTool(ctx, 'browser_screenshot', { targetId: result.targetId, full_page: false });
          if (typeof shot !== 'string') {
            return {
              text: JSON.stringify(failResponse, null, 2),
              imageBase64: shot.imageBase64,
              mediaType: shot.mediaType,
            } satisfies ToolResultWithImage;
          }
        } catch (e) {}
      }
      return JSON.stringify(failResponse, null, 2);
    }`;

code = code.replace(/if \(!result\.success\) \{\s*return \`Login failed: \$\{result\.message\}\`;\s*\}/, failReplace);
fs.writeFileSync(file, code);
