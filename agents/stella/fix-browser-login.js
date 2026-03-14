const fs = require('fs');
const file = './server/routes/soft-agent-chat.ts';
let code = fs.readFileSync(file, 'utf8');

const loginReplacement = `
    const structuredResponse = {
      status: "success",
      service: service,
      method: result.method,
      message: result.message,
      targetId: result.targetId || undefined
    };

    // Always take a screenshot after login (even if already authenticated) so we have a verifiable artifact.
    if (result.targetId) {
      try {
        const shot = await executeBrowserTool(ctx, 'browser_screenshot', { targetId: result.targetId, full_page: false });
        if (typeof shot !== 'string') {
          return {
            text: JSON.stringify(structuredResponse, null, 2),
            imageBase64: shot.imageBase64,
            mediaType: shot.mediaType,
          } satisfies ToolResultWithImage;
        }
      } catch (screenshotError) {
        console.warn('[SoftAgent/BrowserLogin] Post-login screenshot failed (non-fatal):', screenshotError);
      }
    }
    return JSON.stringify(structuredResponse, null, 2);
`;

code = code.replace(/const tabNote = result\.targetId[\s\S]*?return \`Successfully logged into \$\{service\} using \$\{result\.method\}\. \$\{result\.message\}\$\{tabNote\}\`;/m, loginReplacement.trim());

fs.writeFileSync(file, code);
