const fs = require('fs');
const content = fs.readFileSync('src/components/StudentDetailModal.js', 'utf8');
const lines = content.split('\n');
let nest = 0;
let inString = false;
let inTemplate = false;
let inComment = false;
let output = '';

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('/**')) inComment = true;
  if (line.includes('*/')) { inComment = false; continue; }
  if (inComment) continue;
  
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    const prev = j > 0 ? line[j-1] : '';
    
    if (char === '`' && prev !== '\\') inTemplate = !inTemplate;
    if (inTemplate) continue;
    
    if ((char === '"' || char === "'") && prev !== '\\') inString = !inString;
    if (inString) continue;
    
    if (char === '/' && line[j+1] === '/') break;
    
    if (char === '{') nest++;
    if (char === '}') nest--;
    
    if (nest < 0) {
      output = 'Unmatched } at line ' + (i + 1);
      fs.writeFileSync('bracket_result.txt', output);
      process.exit(0);
    }
  }
}
output = 'Final nesting: ' + nest;
fs.writeFileSync('bracket_result.txt', output);
