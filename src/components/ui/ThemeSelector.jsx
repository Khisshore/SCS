import React, { useState, useEffect } from 'react';
import { db } from '../../db/database.js';
import { Icons } from '../../utils/icons.js';
import { setTheme } from '../ThemeToggle.js';
import Aurora from './Aurora.jsx';
import Grainient from './Grainient.jsx';

const PRESETS = [
  {
    id: 'standard',
    name: 'Standard',
    description: 'Clean and minimal focus.',
    type: 'static',
    mode: 'both'
  },
  {
    id: 'aurora',
    name: 'Aurora',
    description: 'Breathtaking northern lights.',
    type: 'live',
    Component: Aurora,
    props: { colorStops: ["#5194db", "#4ba078", "#1493a3"], amplitude: 1.0, blend: 0.5, speed: 0.5 },
    mode: 'dark'
  },
  {
    id: 'grainient',
    name: 'Grainient',
    description: 'Textured soft transitions.',
    type: 'live',
    Component: Grainient,
    props: { 
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
    },
    mode: 'dark'
  },
  {
    id: 'stormy',
    name: 'Stormy Sunday',
    description: 'Melancholic rainy day cozy.',
    type: 'static',
    mode: 'light'
  }
];

export default function ThemeSelector() {
  const [activePreset, setActivePreset] = useState('aurora');
  const [currentTheme, setCurrentTheme] = useState(document.documentElement.getAttribute('data-theme') || 'light');

  useEffect(() => {
    async function loadPreset() {
      const savedPreset = await db.getSetting('visualPreset');
      if (savedPreset) setActivePreset(savedPreset);
    }
    loadPreset();

    const handleThemeChange = (e) => {
      setCurrentTheme(e.detail.theme);
    };

    const handleExternalPresetChange = (e) => {
      setActivePreset(e.detail.preset);
    };

    window.addEventListener('themeChanged', handleThemeChange);
    window.addEventListener('presetChanged', handleExternalPresetChange);
    
    return () => {
      window.removeEventListener('themeChanged', handleThemeChange);
      window.removeEventListener('presetChanged', handleExternalPresetChange);
    };
  }, []);

  const handleSelect = async (preset) => {
    const presetId = preset.id;
    setActivePreset(presetId);
    await db.setSetting('visualPreset', presetId);
    
    // Auto-toggle logic: if dark preset in light mode, switch to dark mode
    if (preset.mode === 'dark' && currentTheme === 'light') {
      setTimeout(() => setTheme('dark'), 10);
    } else if (preset.mode === 'light' && currentTheme === 'dark') {
      setTimeout(() => setTheme('light'), 10);
    }

    // Dispatch event for background.js
    window.dispatchEvent(new CustomEvent('presetChanged', { 
      detail: { preset: presetId } 
    }));
  };

  return (
    <div className="card theme-selector-card">
      <div className="card-header">
        <h3 className="card-title">
          <span className="icon" style={{ marginRight: '0.75rem', color: 'var(--primary-500)' }} dangerouslySetInnerHTML={{ __html: Icons.sparkles }} />
          Atmosphere & Themes
        </h3>
      </div>
      <div className="card-body">
        <p style={{ marginBottom: '2rem', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
          Select a visual atmosphere that matches your workflow. Each theme renders live "liquid glass" effects.
        </p>
        
        <div className="theme-presets-grid">
          {PRESETS.map((preset) => (
            <div
              key={preset.id}
              className={`theme-preset-card ${activePreset === preset.id ? 'active' : ''}`}
              onClick={() => handleSelect(preset)}
            >
              <div className="preset-preview-container">
                {preset.type === 'live' ? (
                  <div className="mini-live-preview">
                    <preset.Component {...preset.props} />
                  </div>
                ) : preset.id === 'stormy' ? (
                  <div className="mini-static-preview stormy">
                    <div className="stormy-visual" />
                    <div className="stormy-accent-dot" />
                  </div>
                ) : (
                  <div className={`mini-static-preview ${currentTheme}`}>
                    <div className="standard-visual" />
                  </div>
                )}
                
                {activePreset === preset.id && (
                  <div className="preset-selected-glow" />
                )}
              </div>
              
              <div className="preset-info">
                <div className="preset-header">
                  <span className="preset-name">{preset.name}</span>
                  <div className="mode-indicators">
                    {preset.mode === 'dark' && <span className="mode-icon" title="Dark Mode Exclusive" dangerouslySetInnerHTML={{ __html: Icons.moon }} />}
                    {preset.mode === 'light' && <span className="mode-icon" title="Light Mode Exclusive" dangerouslySetInnerHTML={{ __html: Icons.sun }} />}
                    {preset.mode === 'both' && (
                      <div className="mode-icon-group" title="Compatible with All Modes">
                        <span className="mode-icon mini" dangerouslySetInnerHTML={{ __html: Icons.sun }} />
                        <span className="mode-icon mini" dangerouslySetInnerHTML={{ __html: Icons.moon }} />
                      </div>
                    )}
                  </div>
                </div>
                <p className="preset-desc">{preset.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
