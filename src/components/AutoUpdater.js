/**
 * AUTO UPDATER COMPONENT (Vanilla JS Version)
 * Handles the UI for application updates
 * Matches SCS professional design language
 */
import './AutoUpdater.css';

class AutoUpdater {
  constructor() {
    this.status = 'idle'; // idle, checking, available, downloading, downloaded, error
    this.info = null;
    this.progress = 0;
    this.error = null;
    this.visible = false;
    this.container = null;
    this.manualCheck = false;
  }

  init() {
    const isDev = window.location.hostname === 'localhost';
    if (!window.electronAPI?.updater && !isDev) {
      console.warn('⚠️ Auto-updater only available in desktop app');
      return;
    }

    // Create container
    this.container = document.createElement('div');
    this.container.id = 'auto-updater-root';
    document.body.appendChild(this.container);

    // Listen for update messages from main process
    if (window.electronAPI?.updater) {
      window.electronAPI.updater.onUpdateMessage((message) => {
        const { type, data } = message;

        switch (type) {
          case 'checking':
            this.setStatus('checking');
            break;
          case 'available':
            this.info = data;
            this.setStatus('available');
            this.setVisible(true);
            break;
          case 'not-available':
            this.setStatus('idle');
            if (this.visible && this.status === 'checking') this.setVisible(false);
            break;
          case 'progress':
            this.progress = Math.round(data.percent);
            this.setStatus('downloading');
            this.updateProgressUI();
            break;
          case 'downloaded':
            this.info = data;
            this.setStatus('downloaded');
            this.setVisible(true);
            break;
      case 'error':
        this.error = data;
        this.setStatus('error');
        // Only show the UI for errors if this was a manual check
        if (this.manualCheck) {
          this.setVisible(true);
        } else {
          console.warn('Silent AutoUpdater error:', data);
          // If silent error, we reset to idle as far as the UI is concerned
          this.status = 'idle';
        }
        this.manualCheck = false; // Reset flag
        break;
          default:
            break;
        }
      });
    }

    this.render();
    console.log('🚀 AutoUpdater UI Initialized (Debug Panel should be visible)');
  }

  setStatus(status) {
    this.status = status;
    this.render();
  }

  setVisible(visible) {
    this.visible = visible;
    if (this.container) {
      if (visible) {
        this.container.classList.add('visible');
      } else {
        this.container.classList.remove('visible');
      }
    }
    this.render();
  }

  updateProgressUI() {
    const fill = this.container?.querySelector('.progress-bar-fill');
    const text = this.container?.querySelector('.progress-text');
    if (fill) fill.style.width = `${this.progress}%`;
    if (text) text.textContent = `${this.progress}%`;
  }

  async handleCheckForUpdates() {
    try {
      this.manualCheck = true;
      this.setStatus('checking');
      this.setVisible(true);
      await window.electronAPI.updater.checkForUpdates();
    } catch (err) {
      this.error = err.message;
      this.setStatus('error');
      this.setVisible(true);
    }
  }

  async handleDownload() {
    try {
      this.setStatus('downloading');
      await window.electronAPI.updater.downloadUpdate();
    } catch (err) {
      this.error = err.message;
      this.setStatus('error');
    }
  }

  async handleInstall() {
    try {
      await window.electronAPI.updater.quitAndInstall();
    } catch (err) {
      this.error = err.message;
      this.setStatus('error');
    }
  }

  // Handle the close button
  handleClose() {
    this.setVisible(false);
  }

  render() {
    if (!this.visible || !this.container) {
      if (this.container) this.container.innerHTML = '';
      return;
    }

    const header = `
      <div class="updater-header">
        <div class="updater-title">
          <span class="updater-icon">
            ${this.status === 'downloaded' ? '✅' : this.status === 'error' ? '❌' : '🚀'}
          </span>
          ${this.status === 'available' ? 'Update Available' : ''}
          ${this.status === 'downloading' ? 'Downloading Update...' : ''}
          ${this.status === 'downloaded' ? 'Update Ready' : ''}
          ${this.status === 'error' ? 'Update Error' : ''}
        </div>
        <button class="updater-close" id="updaterCloseBtn">&times;</button>
      </div>
    `;

    let body = '';
    if (this.status === 'available') {
      body = `
        <div class="updater-body">
          <p>Version ${this.info?.version} is available for download.</p>
          <div class="updater-actions">
            <button class="btn btn-primary btn-sm" id="updaterDownloadBtn">Download Now</button>
          </div>
        </div>
      `;
    } else if (this.status === 'downloading') {
      body = `
        <div class="updater-body">
          <div class="progress-container">
            <div class="progress-bar-wrapper">
              <div class="progress-bar-fill" style="width: ${this.progress}%"></div>
            </div>
            <span class="progress-text">${this.progress}%</span>
          </div>
        </div>
      `;
    } else if (this.status === 'downloaded') {
      body = `
        <div class="updater-body">
          <p>Version ${this.info?.version} has been downloaded. Restart the app to apply the update.</p>
          <div class="updater-actions">
            <button class="btn btn-success btn-sm" id="updaterInstallBtn">Restart & Install</button>
          </div>
        </div>
      `;
    } else if (this.status === 'error') {
      let cleanError = this.error || 'Check failed';
      // Strip noise if it's a GitHub auth error
      if (cleanError.includes('404') || cleanError.includes('authentication token')) {
        cleanError = 'Update check failed (Private Repository). Requires authentication token.';
      }
      
      body = `
        <div class="updater-body">
          <p class="error-text">${cleanError}</p>
          <div class="updater-actions">
            <button class="btn btn-secondary btn-sm" id="updaterDismissBtn">Dismiss</button>
          </div>
        </div>
      `;
    }

    this.container.className = `updater-toast ${this.visible ? 'visible' : ''}`;
    this.container.innerHTML = `
      ${header}
      ${body}
    `;

    // Attach listeners
    document.getElementById('updaterCloseBtn')?.addEventListener('click', () => this.handleClose());
    document.getElementById('updaterDismissBtn')?.addEventListener('click', () => this.handleClose());
    document.getElementById('updaterDownloadBtn')?.addEventListener('click', () => this.handleDownload());
    document.getElementById('updaterInstallBtn')?.addEventListener('click', () => this.handleInstall());
  }
}

// Export singleton
export const autoUpdater = new AutoUpdater();
