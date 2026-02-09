export function createThemeToggle() {
  const currentTheme = localStorage.getItem('theme') || 'light';
  const isDark = currentTheme === 'dark';
  
  return `
    <div class="theme-switch-wrapper">
      <button class="theme-switch ${isDark ? 'is-dark' : ''}" id="theme-toggle-btn" aria-label="Toggle dark mode">
        <div class="theme-switch__circle">
          <div class="theme-switch__sun">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="18.36" x2="5.64" y2="19.78"/><line x1="18.36" y1="4.22" x2="19.78" y2="5.64"/></svg>
          </div>
          <div class="theme-switch__moon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          </div>
        </div>
      </button>
    </div>
  `;
}

export function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
}

export function setTheme(newTheme) {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  if (currentTheme === newTheme) return; // Skip if already set

  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  
  // Notify other services (including React toggles)
  window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: newTheme } }));
}

export function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle-btn') || document.querySelector('.theme-switch');
  if (!btn) return;
  
  btn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  });
}
