const fs = require('fs');
const file = './server/routes/soft-agent-chat.ts';
let code = fs.readFileSync(file, 'utf8');

const replacement = `
    // Format response based on tool type
    if (toolName === 'browser_snapshot') {
      return JSON.stringify({
        targetId: data.targetId,
        url: data.url,
        title: data.title,
        snapshot: data.snapshot
      }, null, 2);
    } else if (toolName === 'browser_screenshot') {
      // Return image data so Claude can see the screenshot
      // Machine Service returns 'base64' field when base64:true is passed
      if (data.base64) {
        const sizeKB = Math.round(data.base64.length / 1024);
        return {
          text: JSON.stringify({
            targetId: data.targetId,
            url: data.url,
            title: data.title,
            message: \`Screenshot captured (\${sizeKB}KB). I can see the image above.\`
          }, null, 2),
          imageBase64: data.base64,
          mediaType: 'image/png' as const,
        } satisfies ToolResultWithImage;
      }
      return JSON.stringify(data, null, 2);
    } else {
      // For navigate, click, type, etc.
      return JSON.stringify(data, null, 2);
    }
`;

code = code.replace(/\/\/ Format response based on tool type[\s\S]*?\} else \{[\s\S]*?return JSON\.stringify\(data, null, 2\);\s*\}/m, replacement.trim());

fs.writeFileSync(file, code);
