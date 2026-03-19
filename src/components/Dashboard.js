/**
 * DASHBOARD COMPONENT
 * Main landing page with overview and statistics
 */

import { Student } from '../models/Student.js';
import { Payment } from '../models/Payment.js';
import { formatCurrency, formatDate, getRelativeTime, formatPaymentMethod } from '../utils/formatting.js';
import { db, STORES } from '../db/database.js';
import { Icons } from '../utils/icons.js';
import { fileSystem } from '../services/fileSystem.js';
import googleDriveService from '../services/googleDriveService.js';
import Chart from 'chart.js/auto';
import { registerActions } from '../actions.js';

/**
 * Render instant skeleton placeholder while real data loads.
 */
export function renderDashboardSkeleton() {
  const container = document.getElementById('app-content');
  const statCards = Array(5).fill('').map(() => `
    <div class="skeleton-stat skeleton-card">
      <div class="skeleton skeleton-circle" style="width:44px;height:44px"></div>
      <div class="skeleton skeleton-heading" style="width:50%"></div>
      <div class="skeleton skeleton-text short"></div>
    </div>
  `).join('');

  const tableRows = Array(5).fill('').map(() => `
    <div class="skeleton-table-row">
      <div class="skeleton skeleton-text" style="width:18%;height:0.75rem"></div>
      <div class="skeleton skeleton-text" style="width:15%;height:0.75rem"></div>
      <div class="skeleton skeleton-text" style="width:12%;height:0.75rem"></div>
      <div class="skeleton skeleton-text short" style="height:0.75rem"></div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="skeleton-page dashboard-page">
      <div class="flex justify-between items-center mb-2xl">
        <div>
          <div class="skeleton skeleton-heading" style="width:180px"></div>
          <div class="skeleton skeleton-text medium"></div>
        </div>
        <div class="flex gap-md">
          <div class="skeleton" style="width:140px;height:40px;border-radius:var(--radius-md)"></div>
          <div class="skeleton" style="width:130px;height:40px;border-radius:var(--radius-md)"></div>
        </div>
      </div>
      <div class="grid grid-5 mb-2xl">${statCards}</div>
      <div class="grid grid-2 mb-2xl">
        <div class="skeleton-card" style="height:520px">
          <div style="padding:1.5rem 2rem;border-bottom:1px solid var(--skeleton-border)">
            <div class="skeleton skeleton-heading" style="width:160px"></div>
          </div>
          <div style="padding:1.5rem 2rem">${tableRows}</div>
        </div>
        <div class="skeleton-card" style="height:520px">
          <div style="padding:1.5rem 2rem">
            <div class="skeleton skeleton-heading" style="width:140px"></div>
          </div>
          <div class="skeleton" style="height:380px;margin:0 2rem;border-radius:var(--radius-lg)"></div>
        </div>
      </div>
    </div>
  `;
}

export async function renderDashboard() {
  const container = document.getElementById('app-content');
  
  // Get statistics
  const studentStats = await Student.getStatistics();
  const recentPayments = await Payment.getRecent(10);
  const currency = await db.getSetting('currency') || 'RM';
  
  // Calculate today's payments
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const todayPayments = await Payment.findAll({ startDate: startOfDay });
  const todayTotal = todayPayments.reduce((sum, p) => sum + p.amount, 0);
  
  // Calculate this month's statistics
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
  const monthPayments = await Payment.findAll({ startDate: startOfMonth });
  const monthTotal = monthPayments.reduce((sum, p) => sum + p.amount, 0);
  
  container.innerHTML = `
    <div class="dashboard-page" style="animation: fadeIn 0.5s ease-in-out;">
      <!-- Page Header -->
      <div class="flex justify-between items-center mb-2xl">
        <div>
          <h1 style="margin-bottom: 0.5rem;">Dashboard</h1>
          <p style="margin: 0; color: var(--text-secondary);">Welcome back! Here's your overview.</p>
        </div>
        <div class="flex gap-md items-center">
          <div id="syncPillContainer" class="sync-pill">
            <div class="icon">${Icons.refresh}</div>
            <div class="flex-column">
              <span id="syncStatusIndicator">Live Synced</span>
              <span id="lastSyncTime">Updated: Just now</span>
            </div>
          </div>
          <button class="btn btn-success" data-action="navigate-hash" data-hash="#spreadsheet">
            <span class="icon">${Icons.dollarSign}</span>
            Record Payment
          </button>
          <button class="btn btn-primary" data-action="dashboard-add-student">
            <span class="icon">${Icons.user}</span>
            Add Student
          </button>
        </div>
      </div>

      <!-- Statistics Cards -->
      <div class="grid grid-5 mb-2xl">
        <!-- Total Students -->
        <div class="stat-card" style="--card-accent: linear-gradient(90deg, #3b82f6, #8b5cf6);">
          <div class="stat-card-icon" style="background: linear-gradient(135deg, #3b82f6, #2563eb); color: white;">
            <span class="icon">${Icons.users}</span>
          </div>
          <div class="stat-card-value">${studentStats.total}</div>
          <div class="stat-card-label">Total Students</div>
        </div>

        <!-- In Progress Students -->
        <div class="stat-card" style="--card-accent: linear-gradient(90deg, #22c55e, #10b981);">
          <div class="stat-card-icon" style="background: linear-gradient(135deg, #22c55e, #16a34a); color: white;">
            <span class="icon">${Icons.userCheck}</span>
          </div>
          <div class="stat-card-value">${studentStats.inProgress}</div>
          <div class="stat-card-label">In Progress</div>
        </div>

        <!-- Today's Payments -->
        <div class="stat-card" style="--card-accent: linear-gradient(90deg, #f59e0b, #ef4444);">
          <div class="stat-card-icon" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white;">
            <span class="icon">${Icons.creditCard}</span>
          </div>
          <div class="stat-card-value">${todayPayments.length}</div>
          <div class="stat-card-label">Today's Payments</div>
        </div>

        <!-- Today's Total -->
        <div class="stat-card" style="--card-accent: linear-gradient(90deg, #ec4899, #f43f5e);">
          <div class="stat-card-icon" style="background: linear-gradient(135deg, #f43f5e, #e11d48); color: white;">
            <span class="icon">${Icons.dollarSign}</span>
          </div>
          <div class="stat-card-value">${formatCurrency(todayTotal, currency).split(' ')[1]}</div>
          <div class="stat-card-label">Today (${currency})</div>
        </div>

        <!-- Monthly Total -->
        <div class="stat-card" style="--card-accent: linear-gradient(90deg, #8b5cf6, #3b82f6);">
          <div class="stat-card-icon" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white;">
            <span class="icon">${Icons.trendingUp}</span>
          </div>
          <div class="stat-card-value">${formatCurrency(monthTotal, currency).split(' ')[1]}</div>
          <div class="stat-card-label">This Month (${currency})</div>
        </div>
      </div>

      <div class="grid grid-2 mb-2xl">
        <!-- Recent Payments -->
        <div class="card dashboard-sync-card">
          <div class="card-header dashboard-card-header">
            <h3 class="card-title">Recent Payments</h3>
            <button class="btn-icon-only" data-action="navigate-hash" data-hash="#reports" title="View all reports" style="margin-left: auto; border-radius: 8px; padding: 4px; color: var(--primary-500); background: var(--primary-50); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;">
              <span class="icon" style="width: 18px; height: 18px;">${Icons.external}</span>
            </button>
          </div>
          <div class="card-body dashboard-card-body">
            ${recentPayments.length > 0 ? `
              <div class="table-container" style="box-shadow: none; overflow-x: auto; width: 100%;">
                <table class="table">
                  <thead>
                    <tr>
                      <th style="text-align: left;">Date / Time</th>
                      <th style="text-align: left; width: 60%;">Student</th>
                      <th style="text-align: right;">Amount</th>
                    </tr>
                  </thead>
                  <tbody id="recentPaymentsList">
                    ${await renderRecentPaymentRows(recentPayments, currency)}
                  </tbody>
                </table>
              </div>
            ` : `
              <div style="text-align: center; padding: 2rem; color: var(--text-tertiary); height: 100%; display: flex; flex-direction: column; justify-content: center;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">
                  <span class="icon icon-xl" style="opacity: 0.5;">${Icons.inbox}</span>
                </div>
                <p>No payments recorded yet</p>
              </div>
            `}
          </div>
        </div>

        <!-- Payment Trend Chart -->
        <div class="card chart-card dashboard-sync-card">
          <div class="card-header dashboard-card-header">
            <h3 class="card-title">Payment Trend</h3>
            <div class="custom-select-wrapper">
              <select id="trendPeriodSelector" class="premium-select">
                <option value="1">Last Month</option>
                <option value="3">Last 3 Months</option>
                <option value="6" selected>Last 6 Months</option>
                <option value="12">Last Year</option>
              </select>
              <span class="select-icon">${Icons.chevronDown}</span>
            </div>
          </div>
          <div class="card-body dashboard-card-body chart-card-body">
            <div style="flex: 1; position: relative; width: 100%; height: 100%;">
              <canvas id="paymentTrendChart"></canvas>
            </div>
          </div>
        </div>
      </div>


    </div>

    <style>
      .chart-card {
        position: relative;
        overflow: hidden;
      }

      .dashboard-sync-card {
        height: 520px;
        display: flex;
        flex-direction: column;
        padding: 0; /* Let header and body handle padding */
      }

      .dashboard-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1.5rem 2rem;
        height: 80px;
        min-height: 80px;
        border-bottom: 1px solid var(--border-light);
        margin-bottom: 0;
      }

      .chart-card .dashboard-card-header {
        border-bottom: none;
      }

      .card-title {
        font-size: 1.125rem;
        font-weight: 700;
        margin: 0;
      }

      .dashboard-card-body {
        flex: 1;
        padding: 1.5rem 2rem;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .chart-card-body {
        padding-top: 0;
      }

      .premium-action-link {
        color: var(--primary-500);
        text-decoration: none;
        font-weight: 700;
        font-size: 0.875rem;
        padding: 0.5rem 1rem;
        border-radius: 10px;
        transition: all 0.2s ease;
        background: var(--primary-50);
        white-space: nowrap;
      }

      .premium-action-link:hover {
        background: var(--primary-100);
        transform: translateY(-1px);
      }

      .custom-select-wrapper {
        position: relative;
        display: flex;
        align-items: center;
      }

      .premium-select {
        appearance: none;
        background: var(--glass-bg);
        backdrop-filter: var(--glass-blur) var(--glass-saturation, );
        -webkit-backdrop-filter: var(--glass-blur) var(--glass-saturation, );
        border: 1px solid var(--glass-border);
        border-radius: 12px;
        padding: 0.6rem 2.5rem 0.6rem 1.25rem;
        font-size: 0.875rem;
        font-weight: 700;
        color: var(--text-primary);
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 
          var(--glass-shadow),
          inset 0 0 0 1px rgba(255, 255, 255, 0.05);
        outline: none;
      }

      .premium-select:hover {
        background: var(--surface-hover);
        border-color: var(--primary-500);
        transform: translateY(-1px);
        box-shadow: 
          var(--shadow-md),
          inset 0 0 0 1px rgba(255, 255, 255, 0.1);
      }

      .premium-select:focus {
        border-color: var(--primary-500);
        box-shadow: 
          0 0 0 4px rgba(6, 182, 212, 0.15),
          inset 0 0 0 1px rgba(255, 255, 255, 0.1);
      }

      .select-icon {
        position: absolute;
        right: 1.1rem;
        pointer-events: none;
        color: var(--primary-500);
        width: 14px;
        height: 14px;
        display: flex;
        align-items: center;
        transition: transform 0.3s ease;
      }

      .custom-select-wrapper:hover .select-icon {
        transform: translateY(1px);
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    </style>
  `;

  // Update Sync Status with premium design
  const updateSyncStatus = async () => {
    const indicator = document.getElementById('syncStatusIndicator');
    const pill = document.getElementById('syncPillContainer');
    const timeLabel = document.getElementById('lastSyncTime');
    const icon = pill?.querySelector('.icon');
    
    if (!indicator || !pill) return;
    
    // Priority 1: Check Google Drive Cloud Mirror status
    try {
      if (googleDriveService.isConnected()) {
        const status = googleDriveService.getStatus();
        pill.classList.add('synced');
        pill.style.background = 'rgba(34, 197, 94, 0.15)';
        if (icon) {
          icon.innerHTML = Icons.googleDrive;
          icon.style.background = '#ffffff';
          icon.style.padding = '5px';
          icon.style.borderRadius = '50%';
          icon.style.display = 'flex';
          icon.style.alignItems = 'center';
          icon.style.justifyContent = 'center';
          icon.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
        }
        indicator.textContent = 'Google Drive Backup';
        timeLabel.textContent = status.lastSync 
          ? `Synced ${getRelativeTime(new Date(status.lastSync))}` 
          : 'Google Drive Connected';
        return;
      }
    } catch (e) {
      console.warn('Cloud status check failed:', e);
    }
    
    // Priority 2: Fallback to library snapshot status (local storage)
    const snapshot = await fileSystem.checkSnapshot();
    const lastSync = await db.getSetting('lastSyncTimestamp');
    
    if (snapshot) {
      pill.classList.add('synced');
      indicator.textContent = 'Filing Cabinet Ready';
      
      if (lastSync) {
        const syncDate = new Date(lastSync);
        if (!isNaN(syncDate.getTime())) {
          timeLabel.textContent = `Last sync: ${getRelativeTime(syncDate)}`;
        }
      }
    } else {
      pill.classList.remove('synced');
      indicator.textContent = 'Standalone Mode';
      timeLabel.textContent = 'Cloud not configured';
    }
  };
  updateSyncStatus();
  // Refresh every 30s
  setInterval(updateSyncStatus, 30000);

  // Render payment trend chart
  try {
    await renderPaymentTrendChart(6); // Default to 6 months
  } catch (error) {
    console.error('Error rendering chart:', error);
    // Chart error shouldn't break the page
  }

  // Add event listener for period selector
  document.getElementById('trendPeriodSelector')?.addEventListener('change', async (e) => {
    const months = parseInt(e.target.value);
    await renderPaymentTrendChart(months);
  });

  registerActions({
    'navigate-hash': (target) => {
      window.location.hash = target.dataset.hash;
    },
    'dashboard-add-student': () => {
      window.location.hash = '#students';
      setTimeout(() => {
        if (window.editStudent) {
          window.editStudent();
        }
      }, 100);
    }
  });
}
/**
 * Render recent payment rows
 */
async function renderRecentPaymentRows(payments, currency) {
  const rows = [];
  
  for (const payment of payments) {
    const student = await Student.findById(payment.studentId);
    
    let badgeClass = 'badge-secondary';
    const method = payment.method?.toLowerCase() || '';
    
    if (method.includes('cash')) {
      badgeClass = 'badge-success';
    } else if (method.includes('online')) {
      badgeClass = 'badge-info'; // Uses the new thematic cyan instead of purple
    } else if (method.includes('transfer') || method.includes('bank')) {
      badgeClass = 'badge-primary';
    } else if (method.includes('card')) {
      badgeClass = 'badge-danger';
    }
    
    rows.push(`
      <tr style="animation: slideIn 0.3s ease-out;">
        <td style="white-space: nowrap; vertical-align: middle;">
          <div style="font-weight: 600;">${formatDate(payment.date, 'short')}</div>
          <div style="color: var(--text-tertiary); font-size: 0.75rem; margin-top: 2px;">${getRelativeTime(payment.createdAt)}</div>
        </td>
        <td title="${student?.name || 'Unknown'}" style="vertical-align: middle;">
          <div style="font-weight: 600; color: var(--text-primary);">
            ${student ? student.name : '<span style="color: var(--text-tertiary);">Orphaned Account</span>'}
          </div>
        </td>
        <td style="white-space: nowrap; vertical-align: middle; text-align: right;"><strong class="amount-positive">${formatCurrency(payment.amount, currency)}</strong></td>
      </tr>
    `);
  }
  
  return rows.join('');
}

/**
 * Render payment trend chart with configurable time period
 */
async function renderPaymentTrendChart(months = 6) {
  const today = new Date();
  const labels = [];
  const data = [];

  // Build months array
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    labels.push(formatDate(date, 'month-year'));
    
    const startDate = new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
    const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59).toISOString();
    
    const payments = await Payment.findByDateRange(startDate, endDate);
    const total = payments.reduce((sum, p) => sum + p.amount, 0);
    data.push(total);
  }

  const ctx = document.getElementById('paymentTrendChart');
  if (!ctx) return;

  // Detect active preset for specific color structure
  const activePreset = document.documentElement.getAttribute('data-visual-preset');
  const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
  
  // Get theme colors from CSS variables
  const style = getComputedStyle(document.documentElement);
  const primaryColor = style.getPropertyValue('--primary-500').trim() || '#26374d';
  const accentColor = activePreset === 'stormy' ? '#f2c94c' : (style.getPropertyValue('--accent-moss').trim() || '#14b8a6');
  const secondaryAccent = activePreset === 'stormy' ? '#4a6781' : '#06b6d4';
  
  const textColor = activePreset === 'stormy' ? 'rgba(38, 55, 77, 0.7)' : (isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(26, 26, 26, 0.6)');
  const gridColor = activePreset === 'stormy' ? 'rgba(74, 103, 129, 0.12)' : (isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.03)');
  const tooltipBg = activePreset === 'stormy' ? 'rgba(38, 55, 77, 0.98)' : (isDarkMode ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.98)');

  // Destroy existing chart if it exists
  if (window.dashboardChart) {
    window.dashboardChart.destroy();
  }

  window.dashboardChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Total Payments',
        data: data,
        borderColor: (context) => {
          const chart = context.chart;
          const {ctx, chartArea} = chart;
          if (!chartArea) return null;
          const gradient = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
          if (activePreset === 'stormy') {
            gradient.addColorStop(0, '#26374d'); // Puddle Navy (Start)
            gradient.addColorStop(0.3, '#4a6781'); // Thunder Blue (Center)
            gradient.addColorStop(1, '#f2c94c'); // Raincoat Yellow (Highlight/End)
          } else {
            gradient.addColorStop(0, primaryColor);
            gradient.addColorStop(0.5, accentColor);
            gradient.addColorStop(1, secondaryAccent);
          }
          return gradient;
        },
        backgroundColor: (context) => {
          const chart = context.chart;
          const {ctx, chartArea} = chart;
          if (!chartArea) return null;
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, activePreset === 'stormy' ? 'rgba(242, 201, 76, 0.4)' : 'rgba(20, 184, 166, 0.4)');
          gradient.addColorStop(0.5, activePreset === 'stormy' ? 'rgba(74, 103, 129, 0.1)' : 'rgba(6, 182, 212, 0.1)');
          gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
          return gradient;
        },
        tension: 0.4,
        fill: true,
        pointRadius: 0, 
        pointHoverRadius: 8,
        pointBackgroundColor: accentColor,
        pointBorderColor: activePreset === 'stormy' ? '#dfe5eb' : 'rgba(255, 255, 255, 0.8)',
        pointBorderWidth: 4,
        borderWidth: 3,
        pointHoverBorderWidth: 4,
        pointHitRadius: 20,
        clip: false // Prevent clipping of points at the edges
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 200,
      layout: {
        padding: {
          top: 20,
          bottom: 25, // More space at bottom for labels and points
          left: 10,
          right: 25
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          enabled: true,
          mode: 'index',
          intersect: false,
          backgroundColor: activePreset === 'stormy' ? 'rgba(38, 55, 77, 0.98)' : (isDarkMode ? 'rgba(255, 255, 255, 0.95)' : 'rgba(30, 41, 59, 0.95)'),
          titleColor: activePreset === 'stormy' ? '#dfe5eb' : (isDarkMode ? '#1e293b' : '#f1f5f9'),
          bodyColor: activePreset === 'stormy' ? '#f2c94c' : '#14b8a6',
          titleFont: { size: 14, weight: 'bold' },
          bodyFont: { size: 16, weight: '900' },
          padding: 16,
          cornerRadius: 16,
          displayColors: false,
          borderColor: activePreset === 'stormy' ? '#4a6781' : 'rgba(20, 184, 166, 0.2)',
          borderWidth: 1,
          boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.3)',
          callbacks: {
            title: (items) => items[0].label,
            label: (item) => `amount : ${item.raw.toLocaleString()}`
          }
        },
        hover: {
          mode: 'index',
          intersect: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            maxTicksLimit: 5,
            padding: 10,
            callback: function(value) {
              return 'RM ' + value;
            },
            font: {
              size: 13,
              weight: '600'
            },
            color: textColor
          },
          border: {
            display: true,
            color: gridColor,
            width: 1
          },
          grid: {
            color: gridColor,
            drawBorder: false,
            borderDash: [5, 5], 
            lineWidth: 1
          }
        },
        x: {
          ticks: {
            padding: 15,
            font: {
              size: 13,
              weight: '600'
            },
            color: textColor
          },
          border: {
            display: true,
            color: gridColor,
            width: 1
          },
          grid: {
            display: false
          }
        }
      }
    }
  });
}
