const fs = require('fs');
const _vm = require('vm');

const code = fs.readFileSync('src/components/StudentDetailModal.js', 'utf8');
try {
  new _vm.Script(code);
  console.log('Syntax OK');
} catch (e) {
  console.error(e.stack);
}
