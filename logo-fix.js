const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'src', 'assets', 'logos', 'scs-logo.png');
const dest = path.join(__dirname, 'public', 'scs-logo.png');

try {
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log('✅ Logo copied to public folder');
    } else {
        console.error('❌ Source logo not found at: ' + src);
    }
} catch (err) {
    console.error('❌ Error copying logo:', err);
}
