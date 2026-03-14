const fs = require('fs');
const file = './server/routes/soft-agent-chat.ts';
let code = fs.readFileSync(file, 'utf8');

const tools = [
  'browser_snapshot', 'browser_screenshot', 'browser_click', 'browser_type', 
  'browser_scroll', 'browser_wait'
];

for (const tool of tools) {
  const regex = new RegExp(`name: '${tool}',[\\s\\S]*?properties: {`, 'g');
  code = code.replace(regex, (match) => {
    // Only add if not already present
    const propCode = code.substring(code.indexOf(match), code.indexOf('},', code.indexOf(match)) + 200);
    if (!propCode.includes('targetId: { type: \'string\'')) {
      return match + `\n        targetId: { type: 'string', description: 'Tab ID from previous navigate/login to stay in the same session' },`;
    }
    return match;
  });
}

// Check browser_new_tab (maybe doesn't need targetId input, it returns one)
// Check browser_login (maybe needs targetId input if logging in on an existing tab, but its current implementation uses navigate internally)

fs.writeFileSync(file, code);
