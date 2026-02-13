/**
 * FIRST RUN SETUP COMPONENT
 * Onboarding wizard for new SCS users
 * FINAL REFINEMENT: Single slide, squared top, visible tree lines + Grainient background
 */

import { db } from '../db/database.js';
import { fileSystem } from '../services/fileSystem.js';
import { Icons } from '../utils/icons.js';
import { mountReactIsland } from '../utils/reactIsland.js';
import LightRays from '../components/ui/LightRays.jsx';

export function renderFirstRunSetup() {
  return `
    <div class="first-run-overlay">
      <div id="light-rays-container" class="light-rays-background"></div>
      <div id="trees-layer" class="trees-background"></div>

      <div class="first-run-container">
        <!-- Progress Bar Removed -->

        <div class="first-run-content">
          <div class="setup-step active">
            <div class="step-header">
              <div class="header-icon">
                <img src="${Icons.logo}" alt="SCS Logo" />
              </div>
              <h1 class="main-title">Student Collection System</h1>
            </div>
            
            <div class="setup-body">
              <div class="folder-tree-preview">
                <div class="tree-header">
                  <h3>Set Storage Location</h3>
                  <p>Choose a folder to store receipts and reports safely offline.</p>
                </div>
                <div class="tree-divider"></div>
                
                <div class="tree-line root-highlight">
                   <span class="icon">${Icons.folder}</span> <span id="treeRootName">Your Selected Folder</span>
                 </div>
                 <div class="tree-line indent-1">
                   <div class="tree-connector"></div>
                   <span class="icon">${Icons.folderOpen}</span> Course Name
                 </div>
                 <div class="tree-line indent-2">
                   <div class="tree-connector"></div>
                   <span class="icon">${Icons.folder}</span> Program Name
                 </div>
                 <div class="tree-line indent-3">
                   <div class="tree-connector"></div>
                   <span class="icon">${Icons.user}</span> Student Name
                 </div>
                 <div class="tree-line indent-4 no-connector">
                   <div class="tree-connector file-connector"></div>
                   <span class="icon">${Icons.fileText}</span> Receipt-0001.pdf
                 </div>
              </div>

              <div class="folder-status hidden" id="selectedFolderDisplay">
                <span class="icon-success">${Icons.checkCircle}</span>
                <div class="path-container">
                  <span class="path-label">Storage Path:</span>
                  <span id="selectedFolderPath" class="path-text"></span>
                </div>
              </div>
            </div>

            <div class="step-actions">
              <button class="btn btn-primary" id="selectFolderBtn">
                ${Icons.folder} Select Folder
              </button>
              <button class="btn btn-success hidden" id="finishSetupBtn">
                Start SCS ${Icons.arrowRight}
              </button>
            </div>
          </div>
        </div>

        <div class="first-run-footer">
          <p>${Icons.refresh} <strong>Tip:</strong> Change storage anytime in Settings.</p>
        </div>
      </div>
    </div>
  `;
}

export function initFirstRunSetup() {
  let selectedFolder = null;
  // Mount LightRays React component
  mountReactIsland('light-rays-container', LightRays, {
    raysOrigin: "top-center",
    raysColor: "#a5f3fc",
    raysSpeed: 1.2,
    lightSpread: 1.4,
    rayLength: 2.3,
    pulsating: false,
    fadeDistance: 1.5,
    saturation: 0.9,
    followMouse: true,
    mouseInfluence: 0.4,
    noiseAmount: 0,
    distortion: 0
  });

  // Select folder
  console.log('FirstRunSetup: Resolving background assets...');
  const treesEl = document.getElementById('trees-layer');
  
  const testPaths = [
    '/src/components/ui/trees.png',
    './src/components/ui/trees.png',
    'src/components/ui/trees.png'
  ];

  const tryLoad = (paths) => {
    if (paths.length === 0) return;
    const path = paths[0];
    const img = new Image();
    img.src = path;
    img.onload = () => {
      console.log(`✅ Success: Trees loaded from ${path}`);
      if (treesEl) treesEl.style.setProperty('--tree-url', `url('${path}')`);
    };
    img.onerror = () => {
      console.warn(`❌ Failed: Trees at ${path}`);
      tryLoad(paths.slice(1));
    };
  };

  tryLoad(testPaths);

  document.getElementById('selectFolderBtn')?.addEventListener('click', async () => {
    try {
      const folderPath = await fileSystem.selectBaseFolder();
      if (folderPath) {
        selectedFolder = folderPath;
        document.getElementById('selectedFolderPath').textContent = folderPath;
        
        // Update tree root name with actual folder name
        const folderName = folderPath.split('\\').pop() || folderPath.split('/').pop() || folderPath;
        document.getElementById('treeRootName').textContent = folderName;
        
        document.getElementById('selectedFolderDisplay').classList.remove('hidden');
        document.getElementById('finishSetupBtn').classList.remove('hidden');
        document.getElementById('selectFolderBtn').innerHTML = `${Icons.folder} Change Folder`;
      }
    } catch (error) {
      console.error(error);
    }
  });

  // Finish
  document.getElementById('finishSetupBtn')?.addEventListener('click', async () => {
    await db.setSetting('firstRunCompleted', true);
    window.location.reload();
  });
}

export const firstRunStyles = `
/* Global Overrides for Onboarding */
body.onboarding-active .sidebar,
body.onboarding-active aside,
body.onboarding-active .nav-divider {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

body.onboarding-active .main-content {
  margin-left: 0 !important;
  padding: 0 !important;
  width: 100vw !important;
}

.first-run-overlay {
  position: fixed;
  inset: 0;
  background: #0c0a0f;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-family: 'Inter', sans-serif;
  overflow: hidden;
}

.light-rays-background {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none;
}

.bg-orb {
  position: absolute;
  width: 500px;
  height: 500px;
  filter: blur(120px);
  opacity: 0.12;
  z-index: 0;
}
.orb-1 { background: #6366f1; top: -150px; right: -150px; }
.orb-2 { background: #a855f7; bottom: -100px; left: -100px; }

.trees-background {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 55%;
  background-position: bottom center;
  background-repeat: repeat-x;
  background-size: contain;
  z-index: 2;
  pointer-events: none;
  
  /* Applying the "Sandpaper" Grain DIRECTLY to the trees */
  /* We use a mask or a second background image with blending */
  background-image: var(--tree-url, none);
  
  /* Dark Grey Look + Sandpaper Texture Mask */
  filter: brightness(0.6) grayscale(1) contrast(1.2);
  opacity: 0.8;
  
  /* Subtle grain mask on the trees themselves */
  mask-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E"), linear-gradient(black, black);
  mask-composite: intersect;
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E"), linear-gradient(black, black);
  -webkit-mask-composite: source-in;
}

.first-run-container {
  position: relative;
  z-index: 10;
  /* Premium Liquid Glass Base */
  background: rgba(13, 14, 20, 0.65); /* Darker, richer base */
  backdrop-filter: blur(40px) saturate(180%); /* Heavy blur + saturation for "liquid" look */
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  
  /* Glass Border & sheen */
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-top: 1px solid rgba(255, 255, 255, 0.2); /* Glossy top edge */
  border-bottom: 1px solid rgba(0, 0, 0, 0.4);
  
  border-radius: 24px; /* Fully rounded for standalone card feel */
  
  width: 680px; /* Refined for better fit */
  display: flex;
  flex-direction: column;
  
  /* Deep Liquid Shadows & Inner Glow */
  box-shadow: 
    0 25px 50px -12px rgba(0, 0, 0, 0.8), /* More dramatic depth */
    0 0 0 1px rgba(255, 255, 255, 0.05) inset, 
    0 2px 0 0 rgba(255, 255, 255, 0.15) inset,
    0 0 40px rgba(165, 243, 252, 0.05) inset; /* Subtle cyan inner-glow */
    
  animation: 
    slideIn 0.8s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes slideIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.setup-progress {
  height: 5px; /* Thicker */
  background: rgba(255, 255, 255, 0.05);
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2;
}

.progress-bar {
  width: 30%;
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #0ea5e9);
  transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.first-run-content {
  padding: 3rem 3rem 2rem; /* Refined for better density */
}

.step-header {
  text-align: center;
  margin-bottom: 2rem;
}

.header-icon {
  width: 100px; /* Reduced for better balance */
  height: 100px;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 0.75rem;
  border: none;
  filter: drop-shadow(0 0 25px rgba(59, 130, 246, 0.3));
}

.header-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transition: transform 0.3s ease;
}

.header-icon:hover img {
  transform: scale(1.05);
}

.step-header .main-title { 
  font-family: 'Outfit', 'Segoe UI', sans-serif; 
  font-size: 2.25rem; /* Reduced for better laptop fit */
  font-weight: 800;
  margin-bottom: 0.5rem; 
  letter-spacing: -0.05em; 
  line-height: 1.2;
  padding: 0.1em 0;
  background: linear-gradient(180deg, #FFFFFF 0%, #90cdf4 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 10px 30px rgba(37, 99, 235, 0.2);
  white-space: nowrap;
}

/* Removed old p styling as it's no longer used for the main title */

.setup-body { display: flex; flex-direction: column; gap: 1.5rem; }

/* Tree Preview Refined */
.folder-tree-preview {
  background: rgba(0, 0, 0, 0.3);
  padding: 1.75rem; 
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-family: 'Inter', sans-serif;
  position: relative;
}

.tree-header h3 { font-size: 1.15rem; margin-bottom: 0.4rem; font-weight: 700; color: #fff; }
.tree-header p { font-size: 0.95rem; color: #94a3b8; line-height: 1.5; margin-bottom: 0; }

.tree-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 1.25rem 0;
}

.tree-line { 
  position: relative; 
  margin: 0.6rem 0; 
  display: flex; 
  align-items: center; 
  color: #94a3b8; 
  font-family: 'JetBrains Mono', 'Cascadia Code', monospace;
  font-size: 0.95rem; 
}

.tree-line .icon { margin-right: 0.75rem; font-size: 1.1rem; }

.root-highlight {
  color: #fff;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.08);
  padding: 0.35rem 0.65rem;
  margin-left: -0.65rem;
  border-radius: 8px;
  width: fit-content;
}

.tree-connector {
  position: absolute;
  left: -1.25rem;
  top: -0.75rem;
  width: 15px;
  height: 1.5rem;
  border-left: 2px solid rgba(255, 255, 255, 0.2);
  border-bottom: 2px solid rgba(255, 255, 255, 0.2);
}

.file-connector {
  height: 1.2rem;
  top: -0.4rem;
}

.indent-1 { margin-left: 2rem; }
.indent-2 { margin-left: 4rem; }
.indent-3 { margin-left: 6rem; }
.indent-4 { margin-left: 8rem; }
.indent-5 { margin-left: 7.5rem; }

.folder-status {
  padding: 1rem;
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: 14px;
  display: flex;
  align-items: center;
  gap: 1rem;
  animation: fadeIn 0.4s ease-out;
}

.icon-success { color: #4ade80; font-size: 1.25rem; }
.path-container { display: flex; flex-direction: column; overflow: hidden; }
.path-label { font-size: 0.75rem; font-weight: 800; color: #4ade80; text-transform: uppercase; margin-bottom: 0.15rem; }
.path-text { 
  font-size: 0.9rem; 
  color: #f1f5f9; 
  font-family: 'JetBrains Mono', monospace; 
  white-space: nowrap; 
  overflow: hidden; 
  text-overflow: ellipsis; 
}

.step-actions { display: flex; gap: 1rem; margin-top: 1.5rem; justify-content: center; }

.btn { 
  position: relative;
  display: inline-flex; align-items: center; gap: 0.75rem;
  padding: 0 2rem; border-radius: 14px; 
  font-weight: 800; cursor: pointer; 
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  font-size: 1rem;
  overflow: hidden; 
  color: #fff;
  height: 54px; /* Reduced for better balance */
  min-width: 200px;
}

.btn-primary { 
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  box-shadow: 
    0 8px 20px rgba(37, 99, 235, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.1) inset;
}

.btn-success { 
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  box-shadow: 
    0 8px 20px rgba(34, 197, 94, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.1) inset;
}

.btn:hover { 
  transform: translateY(-3px) scale(1.02); 
  filter: brightness(1.1);
}

.btn:active { transform: translateY(-1px) scale(0.98); }

.first-run-footer {
  padding: 1.5rem;
  text-align: center;
  font-size: 0.9rem;
  color: #64748b;
  background: rgba(0, 0, 0, 0.2);
  border-bottom-left-radius: 24px;
  border-bottom-right-radius: 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.first-run-footer p { display: flex; align-items: center; justify-content: center; gap: 0.75rem; margin: 0; }
.first-run-footer strong { color: #cbd5e1; }

.hidden { display: none !important; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.first-run-container svg { width: 1.25rem; height: 1.25rem; }

/* Laptop / Small Screen Optimization */
@media (max-height: 850px) {
  .first-run-container {
    max-height: calc(100vh - 60px);
    overflow-y: auto;
    width: 640px;
  }
  .first-run-content {
    padding: 2.25rem 2.5rem 1.5rem;
  }
  .header-icon {
    width: 72px;
    height: 72px;
  }
  .step-header .main-title {
    font-size: 2rem;
  }
  .folder-tree-preview {
    padding: 1.25rem;
  }
}

@media (max-height: 720px) {
  .first-run-container {
    width: 600px;
    transform: scale(0.95);
  }
  .first-run-content {
    padding: 1.5rem 2rem 1rem;
  }
  .setup-body {
    gap: 1rem;
  }
  .tree-header h3 {
    font-size: 1rem;
  }
  .tree-header p {
    font-size: 0.85rem;
  }
  .tree-divider {
    margin: 0.75rem 0;
  }
  .tree-line {
    font-size: 0.85rem;
    margin: 0.4rem 0;
  }
}
`;
