/**
 * FIRST RUN SETUP COMPONENT
 * Onboarding wizard for new NeoTrackr users
 * FINAL REFINEMENT: Single slide, squared top, visible tree lines
 */

import { db } from '../db/database.js';
import { fileSystem } from '../services/fileSystem.js';
import { Icons } from '../utils/icons.js';

export function renderFirstRunSetup() {
  return `
    <div class="first-run-overlay">
      <div class="bg-orb orb-1"></div>
      <div class="bg-orb orb-2"></div>

      <div class="first-run-container">
        <div class="setup-progress">
          <div class="progress-bar" id="progressBar"></div>
        </div>

        <div class="first-run-content">
          <div class="setup-step active">
            <div class="step-header">
              <div class="header-icon">${Icons.dollarSign}</div>
              <h1>Welcome to NeoTrackr</h1>
              <p>A Student Payment Tracking System</p>
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
                  <span class="icon">📁</span> NeoTrackr
                </div>
                <div class="tree-line indent-2">
                  <div class="tree-connector"></div>
                  <span class="icon">📂</span> Course Name
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
                Start NeoTrackr ${Icons.arrowRight}
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
  const progressBar = document.getElementById('progressBar');

  // Select folder
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
        progressBar.style.width = '100%';
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

.first-run-container {
  position: relative;
  z-index: 1;
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0 0 24px 24px; /* Squared top corners */
  width: 520px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 40px 100px rgba(0, 0, 0, 0.6);
  animation: slideIn 0.5s ease-out;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.setup-progress {
  height: 4px;
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
  background: linear-gradient(90deg, #6366f1, #a855f7);
  transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.first-run-content {
  padding: 4rem 2.5rem 2.5rem;
}

.step-header {
  text-align: center;
  margin-bottom: 2.5rem;
}

.header-icon {
  width: 64px;
  height: 64px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2));
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1.25rem;
  color: #818cf8;
  font-size: 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.step-header h1 { 
  font-size: 1.85rem; 
  font-weight: 800;
  margin-bottom: 0.5rem; 
  letter-spacing: -0.02em;
}

.step-header p { 
  color: #94a3b8; 
  font-size: 0.95rem; 
  font-weight: 500;
}

.setup-body { display: flex; flex-direction: column; gap: 1.5rem; }

/* Tree Preview Refined */
.folder-tree-preview {
  background: rgba(0, 0, 0, 0.25);
  padding: 1.5rem;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  font-family: 'Inter', sans-serif;
  position: relative;
}

.tree-header h3 { font-size: 1.1rem; margin-bottom: 0.25rem; font-weight: 700; color: #fff; }
.tree-header p { font-size: 0.85rem; color: #94a3b8; line-height: 1.5; margin-bottom: 0; }

.tree-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 1.25rem 0;
}

.tree-line { 
  position: relative; 
  margin: 0.5rem 0; 
  display: flex; 
  align-items: center; 
  color: #64748b; 
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
}

.tree-line .icon { margin-right: 0.5rem; }

.root-highlight {
  color: #fff;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.05);
  padding: 0.25rem 0.5rem;
  margin-left: -0.5rem;
  border-radius: 6px;
  width: fit-content;
}

.tree-connector {
  position: absolute;
  left: -1rem;
  top: -0.5rem;
  width: 12px;
  height: 1rem;
  border-left: 1px solid rgba(255, 255, 255, 0.3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
}

.file-connector {
  height: 0.8rem;
  top: -0.3rem;
}

.indent-1 { margin-left: 1.5rem; }
.indent-2 { margin-left: 3rem; }
.indent-3 { margin-left: 4.5rem; }
.indent-4 { margin-left: 6rem; }

.folder-status {
  padding: 1rem;
  background: rgba(34, 197, 94, 0.08);
  border: 1px solid rgba(34, 197, 94, 0.25);
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 1rem;
  animation: fadeIn 0.4s ease-out;
}

.icon-success { color: #4ade80; font-size: 1.25rem; }
.path-container { display: flex; flex-direction: column; overflow: hidden; }
.path-label { font-size: 0.75rem; font-weight: 700; color: #4ade80; text-transform: uppercase; margin-bottom: 0.2rem; }
.path-text { font-size: 0.85rem; color: #f1f5f9; font-family: monospace; word-break: break-all; }

.step-actions { display: flex; gap: 1.25rem; margin-top: 1rem; justify-content: center; }

.btn { 
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.9rem 2rem; border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border: none;
  font-size: 1rem;
}
.btn-primary { background: #6366f1; color: #fff; box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3); }
.btn-success { background: #22c55e; color: #fff; box-shadow: 0 4px 15px rgba(34, 197, 94, 0.3); }

.btn:hover { transform: translateY(-2px); filter: brightness(1.1); }
.btn:active { transform: translateY(0); }

.first-run-footer {
  padding: 1.5rem;
  text-align: center;
  font-size: 0.85rem;
  color: #64748b;
  background: rgba(0, 0, 0, 0.25);
  border-bottom-left-radius: 24px;
  border-bottom-right-radius: 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}
.first-run-footer p { display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin: 0; }
.first-run-footer strong { color: #94a3b8; }

.hidden { display: none; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

.first-run-container svg { width: 1.25rem; height: 1.25rem; }
`;
