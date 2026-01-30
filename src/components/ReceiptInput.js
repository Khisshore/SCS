/**
 * SMART RECEIPT INPUT COMPONENT
 * A reusable input field with an auto-generate dropdown option
 */

import { Receipt } from '../models/Receipt.js';
import { Icons } from '../utils/icons.js';

/**
 * Render a smart receipt input into a container
 * @param {string} containerId - ID of the container element
 * @param {object} config - Configuration object
 */
export function renderReceiptInput(containerId, config = {}) {
  const {
    id = 'receipt-input',
    className = '',
    placeholder = 'Receipt #',
    value = '',
    context = 'RCP', // REG, COM, PAY
    onChange = null
  } = config;

  const container = document.getElementById(containerId);
  if (!container) return;

  // Injection unique styles if not already present
  if (!document.getElementById('receipt-input-styles')) {
    const style = document.createElement('style');
    style.id = 'receipt-input-styles';
    style.textContent = `
      .smart-receipt-container {
        position: relative;
        display: flex;
        align-items: center;
        width: 100%;
      }
      .smart-receipt-input {
        padding-right: 2.5rem !important;
      }
      .smart-receipt-trigger {
        position: absolute;
        right: 0.5rem;
        width: 2rem;
        height: 2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: transparent;
        color: var(--text-tertiary);
        cursor: pointer;
        border-radius: var(--radius-md);
        transition: all 0.2s;
        z-index: 5;
      }
      .smart-receipt-trigger:hover {
        background: var(--surface-hover);
        color: var(--primary-600);
      }
      .smart-receipt-menu {
        position: absolute;
        top: calc(100% + 5px);
        right: 0;
        min-width: 160px;
        background: var(--surface);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-lg);
        display: none;
        flex-direction: column;
        padding: 0.5rem;
        z-index: 100;
        animation: menuFadeIn 0.2s ease-out;
      }
      .smart-receipt-menu.show {
        display: flex;
      }
      .smart-receipt-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.625rem 0.75rem;
        border: none;
        background: transparent;
        color: var(--text-primary);
        font-size: 0.875rem;
        font-weight: 500;
        text-align: left;
        cursor: pointer;
        border-radius: var(--radius-md);
        transition: all 0.2s;
        width: 100%;
      }
      .smart-receipt-item:hover {
        background: var(--primary-50);
        color: var(--primary-600);
      }
      .smart-receipt-item .icon {
        font-size: 1rem;
        color: var(--primary-600);
      }
      @keyframes menuFadeIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }

  container.innerHTML = `
    <div class="smart-receipt-container">
      <input 
        type="text" 
        id="${id}" 
        class="form-input smart-receipt-input ${className}" 
        placeholder="${placeholder}" 
        value="${value}"
      />
      <button type="button" class="smart-receipt-trigger" id="${id}-trigger" title="Receipt Options">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px;">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
      <div class="smart-receipt-menu" id="${id}-menu">
        <button type="button" class="smart-receipt-item" id="${id}-auto-gen">
          <span class="icon">✨</span>
          <span>Auto Generate</span>
        </button>
      </div>
    </div>
  `;

  const input = document.getElementById(id);
  const trigger = document.getElementById(`${id}-trigger`);
  const menu = document.getElementById(`${id}-menu`);
  const autoGenBtn = document.getElementById(`${id}-auto-gen`);

  // Handle dropdown toggle
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isShowing = menu.classList.contains('show');
    
    // Close all other smart receipt menus
    document.querySelectorAll('.smart-receipt-menu').forEach(m => m.classList.remove('show'));
    
    if (!isShowing) menu.classList.add('show');
  });

  // Handle auto-generation
  autoGenBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    menu.classList.remove('show');
    
    try {
      const nextReceipt = await Receipt.getNextReceiptNumber(context);
      input.value = nextReceipt;
      if (onChange) onChange(nextReceipt);
    } catch (error) {
      console.error('Error generating receipt:', error);
      alert('Failed to generate receipt number.');
    }
  });

  // Close on outside click
  document.addEventListener('click', () => {
    menu.classList.remove('show');
  });

  // Handle manual changes
  input.addEventListener('input', (e) => {
    if (onChange) onChange(e.target.value);
  });
}
