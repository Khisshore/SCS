/**
 * OPTIMISTIC UI UTILITY
 * Makes mutations feel instant by updating the DOM first,
 * then persisting to DB in the background with automatic rollback on failure.
 */

/**
 * Execute an optimistic mutation.
 * @param {Function} uiAction     - Immediately update the DOM (sync)
 * @param {Function} dbAction     - Persist to database (async)
 * @param {Function} rollbackAction - Revert DOM if dbAction fails (sync)
 * @param {Object}   [options]    - Optional config
 * @param {string}   [options.successMsg] - Toast message on success
 * @param {string}   [options.errorMsg]   - Toast message on failure
 */
export async function optimistic(uiAction, dbAction, rollbackAction, options = {}) {
  // 1. Instantly update the UI
  uiAction();

  try {
    // 2. Persist in background
    await dbAction();

    // 3. Optional success feedback
    if (options.successMsg) {
      showToast(options.successMsg, 'success');
    }
  } catch (err) {
    // 4. Rollback the DOM
    rollbackAction();
    console.error('⚠️ Optimistic rollback:', err);

    // 5. Error feedback
    showToast(options.errorMsg || 'Action failed. Reverted.', 'error');
  }
}

/**
 * Optimistically remove an element from the DOM with animation.
 * @param {HTMLElement} element - The DOM element to remove
 * @param {Function}    dbAction - The async DB deletion
 * @param {Object}      [options] - Optional config
 */
export async function optimisticRemove(element, dbAction, options = {}) {
  if (!element) return;

  // Capture state for rollback
  const parent = element.parentNode;
  const nextSibling = element.nextSibling;
  const originalDisplay = element.style.display;
  const originalMaxHeight = element.scrollHeight + 'px';

  // 1. Animate out
  element.style.maxHeight = originalMaxHeight;
  element.classList.add('optimistic-remove');

  // Force reflow then trigger animation
  element.offsetHeight; // eslint-disable-line no-unused-expressions
  element.classList.add('removing');

  // 2. Remove from DOM after animation
  const removeTimer = setTimeout(() => {
    if (element.parentNode) element.parentNode.removeChild(element);
  }, 400);

  try {
    // 3. Persist deletion
    await dbAction();

    if (options.successMsg) {
      showToast(options.successMsg, 'success');
    }
  } catch (err) {
    // 4. Rollback: re-insert element
    clearTimeout(removeTimer);
    element.classList.remove('optimistic-remove', 'removing');
    element.style.maxHeight = '';
    element.style.display = originalDisplay;

    if (parent) {
      parent.insertBefore(element, nextSibling);
    }

    console.error('⚠️ Optimistic remove rollback:', err);
    showToast(options.errorMsg || 'Delete failed. Reverted.', 'error');
  }
}

/**
 * Lightweight toast notification.
 * @param {string} message - Message to display
 * @param {'success'|'error'} type - Toast type
 */
export function showToast(message, type = 'success') {
  // Remove any existing toasts
  document.querySelectorAll('.toast').forEach(t => t.remove());

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Auto-remove after animation
  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 3200);
}
