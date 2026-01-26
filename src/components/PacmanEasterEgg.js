/**
 * PACMAN EASTER EGG
 * Hidden game that appears when logo is clicked 5 times
 */

let clickCount = 0;
let clickTimer = null;

export function setupPacmanEasterEgg() {
  const logo = document.querySelector('.logo');
  
  if (!logo) return;
  
  logo.addEventListener('click', (e) => {
    e.preventDefault();
    
    // Reset counter if too much time has passed
    if (clickTimer) {
      clearTimeout(clickTimer);
    }
    
    clickCount++;
    
    if (clickCount >= 5) {
      clickCount = 0;
      showPacmanGame();
      return;
    }
    
    // Reset counter after 2 seconds of inactivity
    clickTimer = setTimeout(() => {
      clickCount = 0;
    }, 2000);
  });
}

function showPacmanGame() {
  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'pacman-overlay';
  overlay.className = 'pacman-overlay';
  
  overlay.innerHTML = `
    <div class="pacman-modal">
      <button class="pacman-close-float" aria-label="Close game" title="Close (ESC)">✕</button>
      <div id="pacman"></div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // Setup close button
  const closeBtn = overlay.querySelector('.pacman-close-float');
  closeBtn.addEventListener('click', closePacmanGame);
  
  // Setup overlay click to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closePacmanGame();
    }
  });
  
  // Setup ESC key to close
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closePacmanGame();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
  
  // Animate in
  requestAnimationFrame(() => {
    overlay.classList.add('active');
  });
  
  // Load Pac-Man game
  loadPacmanGame();
}

function closePacmanGame() {
  const overlay = document.getElementById('pacman-overlay');
  if (!overlay) return;
  
  overlay.classList.remove('active');
  setTimeout(() => {
    overlay.remove();
  }, 300);
}

function loadPacmanGame() {
  const el = document.getElementById("pacman");
  
  // Show loading
  el.innerHTML = `
    <div style="color: white; text-align: center; padding: 2rem;">
      <div style="font-size: 4rem; margin-bottom: 1rem;">🎮</div>
      <h3 style="color: #FFFF00; margin-bottom: 1rem;">Classic Pac-Man</h3>
      <p style="color: #fff; margin-bottom: 2rem; opacity: 0.8;">
        Loading game...<br>
        <small style="opacity: 0.6;">This may take a moment</small>
      </p>
      <div class="spinner" style="margin: 0 auto;"></div>
    </div>
  `;
  
  // Load scripts sequentially
  const modernizr = document.createElement('script');
  modernizr.src = 'https://cdnjs.cloudflare.com/ajax/libs/modernizr/2.8.3/modernizr.min.js';
  
  const jquery = document.createElement('script');
  jquery.src = 'https://cdnjs.cloudflare.com/ajax/libs/jquery/2.1.3/jquery.min.js';
  
  modernizr.onload = () => {
    jquery.onload = () => {
      const pacmanScript = document.createElement('script');
      pacmanScript.src = 'https://rawcdn.githack.com/daleharvey/pacman/master/pacman.js';
      
      pacmanScript.onload = () => {
        el.innerHTML = '';
        
        if (window.Modernizr && window.Modernizr.canvas && window.PACMAN) {
          setTimeout(() => {
            try {
              PACMAN.init(el, "https://raw.githubusercontent.com/daleharvey/pacman/master/");
              
              // Monitor game state for custom overlays
              monitorGameState(el);
              
            } catch (e) {
              console.error('Pac-Man init error:', e);
              showError(el, 'Failed to load game', 'Try refreshing');
            }
          }, 100);
        } else {
          showError(el, 'Browser not supported', 'Try Chrome, Firefox, or Safari');
        }
      };
      
      pacmanScript.onerror = () => {
        showError(el, 'Network Error', 'Check your internet connection');
      };
      
      document.head.appendChild(pacmanScript);
    };
    
    document.head.appendChild(jquery);
  };
  
  document.head.appendChild(modernizr);
}

function showError(el, title, message) {
  el.innerHTML = `
    <div style="color: white; text-align: center; padding: 3rem;">
      <p style="font-size: 2rem; margin-bottom: 1rem;">😅</p>
      <p style="font-size: 1.2rem; margin-bottom: 0.5rem;">${title}</p>
      <p style="opacity: 0.7;"><small>${message}</small></p>
    </div>
  `;
}

function monitorGameState(container) {
  // Monitor for game state changes by checking canvas text
  // This is a workaround since we can't directly access PACMAN game state
  let lastCanvasData = '';
  let checkInterval;
  
  checkInterval = setInterval(() => {
    const canvas = container.querySelector('canvas');
    if (!canvas) {
      clearInterval(checkInterval);
      return;
    }
    
    try {
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(canvas.width / 2 - 50, canvas.height - 40, 100, 30);
      const currentData = imageData.data.join(',');
      
      // Detect if game is waiting (level complete or game over scenario)
      // This is approximate - the game shows "Press N to start" when waiting
      if (currentData !== lastCanvasData) {
        // Game state changed - could indicate level complete or game over
        // You could add more sophisticated detection here
      }
      
      lastCanvasData = currentData;
    } catch (e) {
      // Canvas security error or game not ready
    }
  }, 1000);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}
