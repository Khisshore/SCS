/**
 * THEME INITIALIZATION — runs before React mounts.
 * Extracted to an external file to comply with CSP `script-src 'self'`
 * in production builds (inline scripts are blocked by CSP).
 */
(function() {
  try {
    var theme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
  } catch (e) {
    // Silently fail — default light theme will apply via CSS
  }
})();
