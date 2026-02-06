# SCS - Development Guide

## 🔄 Hot Reload vs Rebuild: Do I Need to Update Every Time?

### Development Mode (Hot Reload) ✅ AUTOMATIC

When you run `npm run electron:dev`, changes are **automatically reloaded** - no manual updates needed!

**How it works:**
```bash
npm run electron:dev
```

- **Vite Dev Server**: Runs on `http://localhost:5173` with Hot Module Replacement (HMR)
- **Electron**: Opens window pointing to dev server
- **Changes Detected**: Vite instantly reloads UI when you edit files
- **No Rebuild Needed**: Just save your file and see changes immediately!

**What auto-reloads:**
- ✅ All React/JS files in `src/`
- ✅ CSS changes
- ✅ HTML changes
- ❌ **Electron main process** (`electron/main.js`, `electron/preload.js`) - requires app restart

**When to restart manually:**
- Changed `electron/main.js` or `electron/preload.js`
- Added new IPC handlers
- Modified Electron window settings
- Press `Ctrl+C` in terminal, then run `npm run electron:dev` again

---

### Production Build 📦 MANUAL

Only build when you need a distributable `.exe` file:

```bash
npm run electron:build
```

**When to build:**
- 🚀 Deploying to production
- 📤 Creating installer for users
- 🧪 Testing packaged app behavior
- ⚡ Performance testing

**Build output:**
- Location: `dist-electron/`
- File: `SCS-Setup-1.0.0.exe`
- Size: ~80-120MB (optimized)

---

## 🚀 Quick Start Commands

### First Time Setup
```bash
# Install all dependencies (run once)
npm install

# OR install specific Electron deps
npm install --save-dev electron electron-builder concurrently wait-on cross-env
```

### Daily Development
```bash
# Start development (hot reload enabled)
npm run electron:dev

# Open at http://localhost:5173 in Electron window
# Edit files → Save → See changes instantly!
```

### Testing Web Version
```bash
# Run web version (no Electron)
npm run dev

# Open at http://localhost:5173 in browser
```

### Building for Users
```bash
# Clean previous builds
npm run clean

# Build production app
npm run electron:build

# Test without installer (faster)
npm run electron:build:dir
```

---

## 📦 App Size Optimizations

### Current Optimizations Applied ✅

#### 1. **Electron Builder Config** (`electron-builder.yml`)
```yaml
compression: maximum          # Best compression
asar: true                    # Bundle app files
excludes:                     # Remove unnecessary files
  - node_modules test folders
  - .d.ts files, .md files
  - .git, .DS_Store, etc.
```

**Size Savings**: ~30-40% reduction

#### 2. **Vite Build Optimization** (`vite.config.js`)
```javascript
minify: 'terser'              # Advanced minification
drop_console: true            # Remove console.logs
drop_debugger: true           # Remove debugger statements
manualChunks: {...}           # Code splitting
```

**Size Savings**: ~20-30% reduction in JavaScript bundle

#### 3. **Cleaned Legacy Files**
- ❌ Removed `src/counter.js`
- ❌ Removed `src/javascript.svg`
- ❌ Removed `src/style.css`
- ❌ Removed `src/assets/` (empty)

**Size Savings**: Small but clean codebase

---

### Expected Final Sizes

| Component | Size | Notes |
|-----------|------|-------|
| **Electron Runtime** | 60-80 MB | Chromium + Node.js (unavoidable) |
| **Your App Code** | 2-5 MB | HTML + CSS + JS (optimized) |
| **Dependencies** | 5-10 MB | Chart.js + jsPDF (bundled) |
| **Total Installer** | **80-120 MB** | One-time download |

**Installed App**: 150-200 MB on disk

---

### Further Optimization Tips

#### 1. **Use External Dependencies (Advanced)**
Move Chart.js/jsPDF to CDN in production:
```html
<!-- index.html -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1"></script>
```

**Savings**: ~5-8 MB

#### 2. **Lazy Load Components**
```javascript
// Only load when needed
const Reports = await import('./components/Reports.js');
```

**Savings**: Faster initial load

#### 3. **Compress PDFs Before Storage**
```javascript
// Implement PDF compression before saving
import pako from 'pako';
const compressed = pako.deflate(pdfData);
```

**Savings**: 50-70% smaller PDF files

#### 4. **Tree Shake Chart.js**
```javascript
// Import only what you need
import { Chart, LineController, CategoryScale } from 'chart.js';
```

**Savings**: ~2-3 MB

---

## 🎯 Development Workflow

### Typical Development Day

```bash
# Morning: Start development
npm run electron:dev

# Edit files all day (auto-reload!)
# - src/components/Students.js
# - src/styles/index.css
# - src/utils/pdfGenerator.js

# Changed Electron main process? Restart:
# Ctrl+C, then:
npm run electron:dev

# End of day: Commit changes
git add .
git commit -m "Added student filtering feature"
```

### Before Creating Release

```bash
# 1. Clean everything
npm run clean

# 2. Install fresh dependencies
npm install

# 3. Build production
npm run electron:build

# 4. Test installer
# Run dist-electron/SCS-Setup-1.0.0.exe

# 5. Verify file size
dir dist-electron\*.exe
```

---

## 🛠️ Troubleshooting

### "npm run electron:dev won't start"

**Solution 1:** Kill port 5173
```bash
netstat -ano | findstr :5173
taskkill /PID [PID_NUMBER] /F
```

**Solution 2:** Clear cache
```bash
npm run clean
npm install
npm run electron:dev
```

### "Changes not appearing"

**Check:**
1. Did you save the file? (Ctrl+S)
2. Is terminal showing Vite HMR updates?
3. Are you editing `electron/main.js`? (requires restart)
4. Try hard refresh: `Ctrl+Shift+R` in Electron window

### "Build fails"

**Common causes:**
1. Missing dependencies: `npm install`
2. Old dist folder: `npm run clean`
3. Syntax errors: Check terminal output
4. Node.js version: Update to v16+

---

## 📊 Performance Monitoring

### Check Build Size
```bash
npm run electron:build

# View detailed size report
dir /s dist-electron\*.exe
```

### Analyze Bundle
```bash
# After build, check dist/ folder
dir /s dist\assets\*.js

# Largest files = candidates for optimization
```

---

## 🔐 Security Notes

### Production vs Development

**Development** (`npm run electron:dev`):
- DevTools enabled
- Console logs visible
- Source maps included
- Not secure for distribution

**Production** (`npm run electron:build`):
- DevTools disabled
- Console logs removed (via terser)
- Code minified & obfuscated
- Secure for distribution

---

## 📝 Update Checklist

### When Updating Dependencies

```bash
# Update все dependencies
npm update

# Or specific packages
npm update electron electron-builder

# Test after update
npm run electron:dev
npm run electron:build
```

### When Updating SCS Code

| File | Requires | Action |
|------|----------|--------|
| `src/**/*.js` | Nothing | Save → Auto-reload |
| `src/styles/*.css` | Nothing | Save → Auto-reload |
| `index.html` | Nothing | Save → Auto-reload |
| `electron/main.js` | Restart | Ctrl+C → `npm run electron:dev` |
| `vite.config.js` | Restart | Ctrl+C → `npm run electron:dev` |
| `package.json` | Reinstall | `npm install` |

---

## 🎓 Best Practices

### 1. **Always Use Dev Mode for Development**
```bash
# ✅ GOOD - Hot reload, DevTools, fast
npm run electron:dev

# ❌ BAD - Rebuild every change, slow
npm run electron:build
```

### 2. **Only Build for Distribution**
```bash
# Build once when ready to share
npm run electron:build
```

### 3. **Test Both Modes**
```bash
# Development testing
npm run electron:dev

# Production testing (before release)
npm run electron:build:dir
./dist-electron/win-unpacked/SCS.exe
```

### 4. **Clean Regularly**
```bash
# Weekly or when things feel slow
npm run clean
npm install
```

---

## 🚀 Deployment Workflow

### Version 1.0.0 Release

```bash
# 1. Update version
# Edit package.json: "version": "1.0.0" → "1.0.1"

# 2. Clean build
npm run clean
npm install

# 3. Build production
npm run electron:build

# 4. Test installer
dist-electron/SCS-Setup-1.0.1.exe

# 5. Distribute
# Upload to Google Drive, website, etc.
```

---

**Summary**: You only need to build when distributing. During development, hot reload handles everything automatically! 🎉
