const fs = require('fs');
const file = './server/routes/browser-auth-api.ts';
let code = fs.readFileSync(file, 'utf8');

const oldReturn = `return {
              success: true,
              message: \`Already authenticated - session active (redirected to \${data.url})\`
            };`;

const newReturn = `return {
              success: true,
              message: \`Already authenticated - session active (redirected to \${data.url})\`,
              targetId
            };`;

code = code.replace(oldReturn, newReturn);
fs.writeFileSync(file, code);
