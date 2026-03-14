const fs = require('fs');
const file = './server/routes/browser-auth-api.ts';
let code = fs.readFileSync(file, 'utf8');

const oldErr = `  } catch (error) {
    console.error('[browser-auth] Execute error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Login execution failed'
    };
  }`;

const newErr = `  } catch (error) {
    console.error('[browser-auth] Execute error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Login execution failed',
      targetId
    };
  }`;

code = code.replace(oldErr, newErr);
fs.writeFileSync(file, code);
