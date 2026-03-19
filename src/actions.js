/**
 * GLOBAL ACTION REGISTRY
 * Centralized mapping of data-action names to their respective handler functions.
 */

const registry = {};

/**
 * Register a group of actions
 * @param {Object} actionsMap - Flat object of actionName: function
 */
export function registerActions(actionsMap) {
  Object.assign(registry, actionsMap);
}

/**
 * Get an action handler by name
 * @param {string} actionName 
 * @returns {Function|null}
 */
export function getAction(actionName) {
  return registry[actionName] || null;
}

/**
 * Handle a global event (click, change, etc.)
 * @param {Event} event 
 */
export async function handleGlobalAction(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;

  const actionName = target.dataset.action;
  const handler = getAction(actionName);

  if (handler) {
    // If it's a click on an anchor or button etc.
    if (event.type === 'click' && (target.tagName === 'A' || target.tagName === 'BUTTON')) {
      // Allow default only if explicitly requested or if it's a specific requirement
      // For now, many of our links use onclick="...; return false;"
      if (!target.dataset.allowDefault) {
        event.preventDefault();
      }
    }
    
    // Stop propagation by default for these actions to avoid parent triggers
    if (target.dataset.stopPropagation) {
      event.stopPropagation();
    }

    // Call the handler with the target and the original event
    try {
      await handler(target, event);
    } catch (err) {
      console.error(`Error executing action "${actionName}":`, err);
    }
  } else {
    console.warn(`No handler registered for action: ${actionName}`);
  }
}
