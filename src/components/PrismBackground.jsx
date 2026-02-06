import React from 'react';
import Prism from './ui/Prism';

export default function PrismBackground(props) {
  // Use user provided props or defaults
  const color = props.color || '#6366f1'; 
  
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      zIndex: 0,
      background: '#04000b' // Dark background fallback
    }}>
      <Prism color={color} {...props} />
    </div>
  );
}
