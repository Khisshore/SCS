import { mountReactIsland, unmountReactIsland } from '../utils/reactIsland.js';
import Grainient from '../components/ui/Grainient.jsx';
import Aurora from '../components/ui/Aurora.jsx';
import { db } from '../db/database.js';

/**
 * BACKGROUND SERVICE
 * Manages the mounting and unmounting of background components based on theme and preset
 */

let unmountTimer = null;
let currentPreset = 'aurora';

/**
 * Initialize background management
 */
export async function initBackground() {
  // Initial load from DB
  const savedPreset = await db.getSetting('visualPreset');
  if (savedPreset) currentPreset = savedPreset;
  
  // Set initial preset attribute
  document.documentElement.setAttribute('data-visual-preset', currentPreset);

  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  updateBackground(currentTheme, currentPreset);

  // Listen for theme changes
  window.addEventListener('themeChanged', async (e) => {
    const newTheme = e.detail.theme;
    let fallbackPreset = null;
    
    // Auto-override logic: aurora and grainient are dark-exclusive
    if (newTheme === 'light' && (currentPreset === 'aurora' || currentPreset === 'grainient')) {
      console.log(`🌓 Auto-overriding ${currentPreset} for Light mode`);
      fallbackPreset = 'standard';
    } 
    // New: Stormy Sunday is light-exclusive
    else if (newTheme === 'dark' && currentPreset === 'stormy') {
      console.log(`🌓 Auto-overriding Stormy Sunday for Dark mode`);
      fallbackPreset = 'standard';
    }

    if (fallbackPreset) {
      currentPreset = fallbackPreset;
      await db.setSetting('visualPreset', fallbackPreset);
      document.documentElement.setAttribute('data-visual-preset', fallbackPreset);
      window.dispatchEvent(new CustomEvent('presetChanged', { detail: { preset: fallbackPreset } }));
    }
    
    updateBackground(newTheme, currentPreset);
  });

  // Listen for preset changes
  window.addEventListener('presetChanged', (e) => {
    currentPreset = e.detail.preset;
    document.documentElement.setAttribute('data-visual-preset', currentPreset);
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    updateBackground(theme, currentPreset);
  });
}

/**
 * Update background based on theme and preset
 */
function updateBackground(theme, preset) {
  const container = document.getElementById('bg-island-container');
  if (!container) return;

  if (unmountTimer) {
    clearTimeout(unmountTimer);
    unmountTimer = null;
  }

  if (theme === 'dark' && preset !== 'standard') {
    container.style.display = 'block';
    
    // Choose component based on preset
    let Component = Aurora;
    let props = { colorStops: ["#5194db", "#4ba078", "#1493a3"], amplitude: 1.0, blend: 0.5 };

    if (preset === 'grainient') {
      Component = Grainient;
      props = {
        color1: "#3e3d3e",
        color2: "#030303",
        color3: "#505053",
        timeSpeed: 0.25,
        colorBalance: 0,
        warpStrength: 0.85,
        warpFrequency: 5,
        warpSpeed: 2,
        warpAmplitude: 50,
        blendAngle: 0,
        blendSoftness: 0.34,
        rotationAmount: 500,
        noiseScale: 2,
        grainAmount: 0.1,
        grainScale: 2,
        grainAnimated: false,
        contrast: 1.5,
        gamma: 1,
        saturation: 1,
        centerX: 0,
        centerY: 0,
        zoom: 0.9
      };
    }

    // Mount selected React island
    mountReactIsland('bg-island-container', Component, props);

    requestAnimationFrame(() => {
      container.style.opacity = '1';
    });
  } else {
    // Fade out and unmount for light mode or standard preset
    container.style.opacity = '0';
    unmountTimer = setTimeout(() => {
      unmountReactIsland('bg-island-container');
      container.style.display = 'none';
      unmountTimer = null;
    }, 1200);
  }
}
