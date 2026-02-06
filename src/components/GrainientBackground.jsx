import React from 'react';
import Grainient from './ui/Grainient.jsx';

/**
 * Grainient Background Wrapper
 * React component wrapper for the Grainient animated gradient
 */
export default function GrainientBackground({
  color1 = '#04000b',
  color2 = '#3e3c49',
  color3 = '#68666b',
  timeSpeed = 0.25,
  colorBalance = 0,
  warpStrength = 1,
  warpFrequency = 5,
  warpSpeed = 6,
  warpAmplitude = 50,
  blendAngle = 0,
  blendSoftness = 0.05,
  rotationAmount = 1440,
  noiseScale = 2,
  grainAmount = 0.1,
  grainScale = 2,
  grainAnimated = false,
  contrast = 1.5,
  gamma = 1,
  saturation = 1,
  centerX = 0,
  centerY = 0,
  zoom = 0.9
}) {
  return (
    <div style={{ 
      position: 'absolute', 
      inset: 0, 
      width: '100%', 
      height: '100%',
      zIndex: 0
    }}>
      <Grainient
        color1={color1}
        color2={color2}
        color3={color3}
        timeSpeed={timeSpeed}
        colorBalance={colorBalance}
        warpStrength={warpStrength}
        warpFrequency={warpFrequency}
        warpSpeed={warpSpeed}
        warpAmplitude={warpAmplitude}
        blendAngle={blendAngle}
        blendSoftness={blendSoftness}
        rotationAmount={rotationAmount}
        noiseScale={noiseScale}
        grainAmount={grainAmount}
        grainScale={grainScale}
        grainAnimated={grainAnimated}
        contrast={contrast}
        gamma={gamma}
        saturation={saturation}
        centerX={centerX}
        centerY={centerY}
        zoom={zoom}
      />
    </div>
  );
}
