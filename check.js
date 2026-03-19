const fs = require('fs');
const acorn = require('acorn');
const code = fs.readFileSync('src/components/StudentDetailModal.js', 'utf8');
try {
  acorn.parse(code, { ecmaVersion: 2022, sourceType: 'module' });
  fs.writeFileSync('parse.txt', 'OK');
} catch (e) {
  fs.writeFileSync('parse.txt', e.message + ' at ' + e.loc.line + ':' + e.loc.column);
}
