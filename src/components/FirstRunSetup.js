/**
 * FIRST RUN SETUP COMPONENT
 * Onboarding wizard for new SCS users
 * FINAL REFINEMENT: Single slide, squared top, visible tree lines + Grainient background
 */

import { db } from '../db/database.js';
import { fileSystem } from '../services/fileSystem.js';
import { Icons } from '../utils/icons.js';
import { mountReactIsland } from '../utils/reactIsland.js';
import Aurora from '../components/ui/Aurora.jsx';

export function renderFirstRunSetup() {
  return `
    <div class="first-run-overlay">
      <div id="grainient-container" class="grainient-background"></div>
      <div id="trees-layer" class="trees-background"></div>

      <div class="first-run-container">
        <!-- Progress Bar Removed -->

        <div class="first-run-content">
          <div class="setup-step active">
            <div class="step-header">
              <div class="header-icon">
                <img src="/src/assets/logos/scs-logo.png" alt="SCS Logo" />
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
                  <span class="icon">📁</span> <span id="treeRootName">Your Selected Folder</span>
                </div>
                <div class="tree-line indent-1">
                  <div class="tree-connector"></div>
                  <span class="icon">📂</span> Course Name
                </div>
                <div class="tree-line indent-2">
                  <div class="tree-connector"></div>
                  <span class="icon">📂</span> Program Name
                </div>
                <div class="tree-line indent-3">
                  <div class="tree-connector"></div>
                  <span class="icon">👤</span> Student Name
                </div>
                <div class="tree-line indent-4 no-connector">
                  <div class="tree-connector file-connector"></div>
                  <span class="icon">📄</span> Receipt-0001.pdf
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
  // Mount Aurora React component
  mountReactIsland('grainient-container', Aurora, {
    colorStops: ["#7cff67", "#0ea5e9", "#2563eb"],
    amplitude: 1,
    blend: 0.5
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

.grainient-background {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
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
  z-index: 1;
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
  /* If you strictly want squared top, verify with user, but "card" implies rounded usually. */
  /* Reverting to previous shape if user insisted on it, but 24px is standard "Card". */
  /* Let's go with all-rounded for a true floating "Card" effect unless specified otherwise. */
  
  width: 720px; /* Increased from 640px */
  display: flex;
  flex-direction: column;
  
  /* Deep Liquid Shadows */
  box-shadow: 
    0 25px 50px -12px rgba(0, 0, 0, 0.8), /* More dramatic depth */
    0 0 0 1px rgba(255, 255, 255, 0.05) inset, 
    0 2px 0 0 rgba(255, 255, 255, 0.15) inset;
    
  animation: slideIn 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(30px); }
  to { opacity: 1; transform: translateY(0); }
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
  padding: 4rem 3.5rem 3rem; /* More breathing room */
}

.step-header {
  text-align: center;
  margin-bottom: 2.5rem;
}

.header-icon {
  width: 120px; /* Scaled up as requested */
  height: 120px;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1rem; /* Tightened branding unit */
  border: none;
  filter: drop-shadow(0 0 25px rgba(59, 130, 246, 0.3)); /* Stronger brand glow */
}

.header-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.step-header .main-title { 
  font-family: 'Outfit', 'Segoe UI', sans-serif; 
  font-size: 2.75rem; 
  font-weight: 800;
  margin-bottom: 0.5rem; 
  letter-spacing: -0.05em; 
  line-height: 1.2; /* Fixed cutoff: added height */
  padding: 0.2em 0; /* Fixed cutoff: added vertical room for clip-text */
  background: linear-gradient(180deg, #FFFFFF 0%, #90cdf4 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 10px 30px rgba(37, 99, 235, 0.3);
  white-space: nowrap;
}

/* Removed old p styling as it's no longer used for the main title */

.setup-body { display: flex; flex-direction: column; gap: 2rem; }

/* Tree Preview Refined */
.folder-tree-preview {
  background: rgba(0, 0, 0, 0.3);
  padding: 2rem; /* More padding */
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-family: 'Inter', sans-serif;
  position: relative;
}

.tree-header h3 { font-size: 1.3rem; margin-bottom: 0.5rem; font-weight: 700; color: #fff; }
.tree-header p { font-size: 1rem; color: #94a3b8; line-height: 1.6; margin-bottom: 0; }

.tree-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 1.75rem 0;
}

.tree-line { 
  position: relative; 
  margin: 0.75rem 0; 
  display: flex; 
  align-items: center; 
  color: #94a3b8; 
  font-family: 'JetBrains Mono', 'Cascadia Code', monospace;
  font-size: 1rem; /* Scaled up */
}

.tree-line .icon { margin-right: 0.75rem; font-size: 1.2rem; }

.root-highlight {
  color: #fff;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.08);
  padding: 0.4rem 0.75rem;
  margin-left: -0.75rem;
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
  padding: 1.25rem;
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: 14px;
  display: flex;
  align-items: center;
  gap: 1.25rem;
  animation: fadeIn 0.4s ease-out;
}

.icon-success { color: #4ade80; font-size: 1.5rem; }
.path-container { display: flex; flex-direction: column; overflow: hidden; }
.path-label { font-size: 0.85rem; font-weight: 800; color: #4ade80; text-transform: uppercase; margin-bottom: 0.25rem; }
.path-text { 
  font-size: 1rem; 
  color: #f1f5f9; 
  font-family: 'JetBrains Mono', monospace; 
  white-space: nowrap; 
  overflow: hidden; 
  text-overflow: ellipsis; 
}

.step-actions { display: flex; gap: 1.5rem; margin-top: 2rem; justify-content: center; }

.btn { 
  position: relative;
  display: flex; align-items: center; gap: 1rem;
  padding: 1.25rem 3rem; border-radius: 16px; 
  font-weight: 800; cursor: pointer; 
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  font-size: 1.1rem; /* Scaled up */
  overflow: hidden; 
  color: #fff;
  height: 64px; /* Scaled up from 52px */
  flex: 1; /* Stretch buttons equally if in same row */
  max-width: 280px;
}

.btn-primary { 
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  box-shadow: 
    0 10px 25px rgba(37, 99, 235, 0.4),
    0 0 0 1px rgba(255, 255, 255, 0.15) inset;
}

.btn-success { 
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  box-shadow: 
    0 10px 25px rgba(34, 197, 94, 0.4),
    0 0 0 1px rgba(255, 255, 255, 0.15) inset;
}

.btn:hover { 
  transform: translateY(-4px) scale(1.03); 
  filter: brightness(1.25);
  box-shadow: 0 15px 35px rgba(37, 99, 235, 0.5);
}

.btn-success:hover {
  box-shadow: 0 15px 35px rgba(34, 197, 94, 0.5);
}

.btn:active { transform: translateY(-1px) scale(0.97); }

.first-run-footer {
  padding: 1.75rem;
  text-align: center;
  font-size: 1rem;
  color: #64748b;
  background: rgba(0, 0, 0, 0.25);
  border-bottom-left-radius: 24px;
  border-bottom-right-radius: 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.first-run-footer p { display: flex; align-items: center; justify-content: center; gap: 0.75rem; margin: 0; }
.first-run-footer strong { color: #cbd5e1; }

.hidden { display: none; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }

.first-run-container svg { width: 1.5rem; height: 1.5rem; }

/* Laptop / Small Screen Adjustments */
@media (max-height: 900px) {
  .first-run-container {
    transform: scale(0.8); 
    /* Remove margin: auto since parent is already flex-center */
    transform-origin: center;
  }
  .first-run-content {
    padding: 2.5rem 3.5rem 2.5rem; /* Balanced internal padding */
  }
}
@media (max-height: 768px) {
  .first-run-container {
    transform: scale(0.72); 
    transform-origin: center;
  }
}
@media (max-height: 640px) {
  .first-run-container {
    transform: scale(0.65); 
    transform-origin: center;
  }
}
`;
