const fs = require('fs');
const files = [
  'src/components/AiChat.js',
  'src/services/smartXLSXProcessor.js',
  'electron/ollama-manager.js'
];
for (const f of files) {
  try {
    fs.readFileSync(f, 'utf8');
    console.log('OK:', f);
  } catch(e) {
    console.log('FAIL:', f, e.message);
  }
}
