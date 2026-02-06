/**
 * DASHBOARD COMPONENT
 * Main landing page with overview and statistics
 */

import { Student } from '../models/Student.js';
import { Payment } from '../models/Payment.js';
import { formatCurrency, formatDate, getRelativeTime } from '../utils/formatting.js';
import { db, STORES } from '../db/database.js';
import { Icons } from '../utils/icons.js';
import { fileSystem } from '../services/fileSystem.js';
import Chart from 'chart.js/auto';

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
          <div id="syncPillContainer" class="sync-pill" onclick="window.location.hash = '#transfer'" title="Data Transfer & Sync Hub">
            <div class="icon">${Icons.refresh}</div>
            <div class="flex flex-column" style="display: flex; flex-direction: column;">
              <span id="syncStatusIndicator">Syncing...</span>
              <span id="lastSyncTime" style="font-size: 10px; opacity: 0.7; font-weight: 400; margin-top: -2px;">Checking...</span>
            </div>
          </div>
          <button class="btn btn-success" id="quickPaymentBtn">
            <span class="icon">${Icons.dollarSign}</span>
            Record Payment
          </button>
          <button class="btn btn-primary" id="quickStudentBtn">
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

        <!-- Active Students -->
        <div class="stat-card" style="--card-accent: linear-gradient(90deg, #22c55e, #10b981);">
          <div class="stat-card-icon" style="background: linear-gradient(135deg, #22c55e, #16a34a); color: white;">
            <span class="icon">${Icons.userCheck}</span>
          </div>
          <div class="stat-card-value">${studentStats.active}</div>
          <div class="stat-card-label">Active Students</div>
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
          </div>
          <div class="card-body dashboard-card-body">
            ${recentPayments.length > 0 ? `
              <div class="table-container" style="box-shadow: none;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Time</th>
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
        background: var(--glass-bg);
        backdrop-filter: var(--glass-blur);
        -webkit-backdrop-filter: var(--glass-blur);
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
        backdrop-filter: var(--glass-blur);
        -webkit-backdrop-filter: var(--glass-blur);
        border: 1px solid var(--glass-border);
        border-radius: 12px;
        padding: 0.6rem 2.5rem 0.6rem 1.25rem;
        font-size: 0.875rem;
        font-weight: 700;
        color: var(--text-secondary);
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: var(--shadow-sm);
      }

      .premium-select:hover {
        background: var(--surface-hover);
        border-color: var(--primary-400);
        transform: translateY(-1px);
      }

      .select-icon {
        position: absolute;
        right: 1rem;
        pointer-events: none;
        color: var(--text-tertiary);
        width: 14px;
        height: 14px;
        display: flex;
        align-items: center;
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
    
    const snapshot = await fileSystem.checkSnapshot();
    const lastSync = await db.getSetting('lastSyncTimestamp');
    
    if (snapshot) {
      pill.classList.add('synced');
      indicator.textContent = 'Data Synced';
      
      if (lastSync) {
        try {
          const syncDate = new Date(lastSync);
          if (!isNaN(syncDate.getTime())) {
            const timeStr = getRelativeTime(syncDate);
            timeLabel.textContent = `Last sync: ${timeStr}`;
          } else {
            timeLabel.textContent = 'Recently';
          }
        } catch (e) {
          timeLabel.textContent = 'Synced';
        }
      } else {
        timeLabel.textContent = 'Ready';
      }
      
      // Add a brief pulse if synced in the last 10 seconds
      if (lastSync && typeof lastSync === 'number' && (Date.now() - lastSync < 10000)) {
        icon?.classList.add('sync-pill-pulse');
        setTimeout(() => icon?.classList.remove('sync-pill-pulse'), 5000);
      }
    } else {
      pill.classList.remove('synced');
      indicator.textContent = 'Not Synced';
      timeLabel.textContent = 'Set up library';
    }
  };
  updateSyncStatus();

  // Attach event listeners
  document.getElementById('quickPaymentBtn')?.addEventListener('click', () => {
    window.location.hash = '#spreadsheet';
  });

  document.getElementById('quickStudentBtn')?.addEventListener('click', async () => {
    // Load the students component first, then open the modal
    window.location.hash = '#students';
    // Wait for navigation to complete
    setTimeout(() => {
      if (window.editStudent) {
        window.editStudent();
      }
    }, 100);
  });

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
}

/**
 * Render recent payment rows
 */
async function renderRecentPaymentRows(payments, currency) {
  const rows = [];
  
  for (const payment of payments) {
    const student = await Student.findById(payment.studentId);
    const studentName = student ? student.name : 'Unknown';
    
    let badgeClass = 'badge-secondary';
    const method = payment.method?.toUpperCase() || '';
    
    if (method.includes('CASH')) {
      badgeClass = 'badge-success';
    } else if (method.includes('ONLINE')) {
      badgeClass = 'badge-info';
    } else if (method.includes('TRANSFER') || method.includes('BANK')) {
      badgeClass = 'badge-primary';
    } else if (method.includes('CREDIT') || method.includes('CARD')) {
      badgeClass = 'badge-danger';
    }
    
    rows.push(`
      <tr style="animation: slideIn 0.3s ease-out;">
        <td>${formatDate(payment.date, 'short')}</td>
        <td><strong>${formatCurrency(payment.amount, currency)}</strong></td>
        <td><span class="badge ${badgeClass}">${payment.method}</span></td>
        <td style="color: var(--text-tertiary); font-size: var(--font-size-sm);">${getRelativeTime(payment.createdAt)}</td>
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
    labels.push(date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
    
    const startDate = new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
    const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59).toISOString();
    
    const payments = await Payment.findByDateRange(startDate, endDate);
    const total = payments.reduce((sum, p) => sum + p.amount, 0);
    data.push(total);
  }

  const ctx = document.getElementById('paymentTrendChart');
  if (!ctx) return;

  // Detect current theme
  const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)';
  const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
  const tooltipBg = isDarkMode ? 'rgba(30, 41, 59, 0.9)' : 'rgba(0, 0, 0, 0.8)';

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
          gradient.addColorStop(0, '#14b8a6');
          gradient.addColorStop(0.5, '#06b6d4');
          gradient.addColorStop(1, '#3b82f6');
          return gradient;
        },
        backgroundColor: (context) => {
          const chart = context.chart;
          const {ctx, chartArea} = chart;
          if (!chartArea) return null;
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, 'rgba(20, 184, 166, 0.4)');
          gradient.addColorStop(0.5, 'rgba(6, 182, 212, 0.1)');
          gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
          return gradient;
        },
        tension: 0.4,
        fill: true,
        pointRadius: 0, 
        pointHoverRadius: 8,
        pointBackgroundColor: '#14b8a6',
        pointBorderColor: 'rgba(255, 255, 255, 0.8)',
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
          backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.95)' : 'rgba(30, 41, 59, 0.95)',
          titleColor: isDarkMode ? '#1e293b' : '#f1f5f9',
          bodyColor: '#14b8a6',
          titleFont: { size: 14, weight: 'bold' },
          bodyFont: { size: 16, weight: '900' },
          padding: 16,
          cornerRadius: 16,
          displayColors: false,
          borderColor: 'rgba(20, 184, 166, 0.2)',
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
