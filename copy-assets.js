const fs = require('fs');
const path = require('path');

const operations = [
  {
    src: path.join(__dirname, 'src/components/ui/trees.png'),
    dest: path.join(__dirname, 'public/trees.png'),
    name: 'Trees Background'
  },
  {
    src: path.join(__dirname, 'src/assets/logos/scs-logo.png'),
    dest: path.join(__dirname, 'public/icon.png'),
    name: 'App Icon'
  }
];

operations.forEach(op => {
  console.log(`[${op.name}] Copying...`);
  console.log(`  Source: ${op.src}`);
  console.log(`  Dest:   ${op.dest}`);

  try {
    if (!fs.existsSync(op.src)) {
      console.error(`  ERROR: Source file does not exist!`);
      return;
    }
    
    // Ensure dest dir exists just in case (though public likely does)
    const destDir = path.dirname(op.dest);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    fs.copyFileSync(op.src, op.dest);
    
    // Verify
    if (fs.existsSync(op.dest)) {
        const stats = fs.statSync(op.dest);
        console.log(`  SUCCESS: File copied. Size: ${stats.size} bytes`);
    } else {
        console.error(`  ERROR: Copy looked successful but file is missing?`);
    }
    
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
  }
  console.log('---');
});
