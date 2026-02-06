import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * React Island Utility
 * Mounts React components in specific DOM containers within a vanilla JS app
 */

const islands = new Map();

/**
 * Mount a React component in a DOM element
 * @param {string} containerId - ID of the DOM element to mount into
 * @param {React.Component} Component - React component to render
 * @param {Object} props - Props to pass to the component
 */
export function mountReactIsland(containerId, Component, props = {}) {
  const container = document.getElementById(containerId);
  
  if (!container) {
    console.error(`Container #${containerId} not found`);
    return null;
  }

  // Unmount existing island if present
  if (islands.has(containerId)) {
    islands.get(containerId).unmount();
  }

  // Create and mount new root
  const root = createRoot(container);
  root.render(createElement(Component, props));
  islands.set(containerId, root);

  return root;
}

/**
 * Unmount a React island
 * @param {string} containerId - ID of the container to unmount
 */
export function unmountReactIsland(containerId) {
  const root = islands.get(containerId);
  if (root) {
    root.unmount();
    islands.delete(containerId);
  }
}

/**
 * Unmount all React islands
 */
export function unmountAllIslands() {
  islands.forEach(root => root.unmount());
  islands.clear();
}
