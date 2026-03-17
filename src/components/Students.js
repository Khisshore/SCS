/**
 * STUDENTS COMPONENT
 * Student management interface
 */

import { Student } from '../models/Student.js';
import { Payment } from '../models/Payment.js';
import { Programme } from '../models/Programme.js';
import { Receipt } from '../models/Receipt.js';
import { Icons } from '../utils/icons.js';
import { formatDate, escapeHtml } from '../utils/formatting.js';
import { initStudentDetailModal, openStudentDetailModal } from './StudentDetailModal.js';
import { renderReceiptInput } from './ReceiptInput.js';
import { optimisticRemove, showToast } from '../utils/optimistic.js';

/**
 * Render instant skeleton placeholder while real data loads.
 */
export function renderStudentsSkeleton() {
  const container = document.getElementById('app-content');
  const rows = Array(8).fill('').map(() => `
    <div class="skeleton-table-row">
      <div class="skeleton skeleton-text" style="width:5%;height:0.75rem"></div>
      <div class="skeleton skeleton-text" style="width:25%;height:0.75rem"></div>
      <div class="skeleton skeleton-text" style="width:20%;height:0.75rem"></div>
      <div class="skeleton skeleton-text" style="width:12%;height:0.75rem"></div>
      <div class="skeleton skeleton-text" style="width:10%;height:0.75rem"></div>
      <div class="skeleton" style="width:90px;height:32px;border-radius:var(--radius-md)"></div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="skeleton-page" style="animation: fadeIn 0.5s ease-in-out;">
      <div class="flex justify-between items-center mb-2xl">
        <div>
          <div class="skeleton skeleton-heading" style="width:220px"></div>
          <div class="skeleton skeleton-text medium"></div>
        </div>
        <div class="skeleton" style="width:150px;height:40px;border-radius:var(--radius-md)"></div>
      </div>
      <div class="card mb-xl"><div class="card-body">
        <div class="skeleton" style="width:100%;height:44px;border-radius:var(--radius-md)"></div>
      </div></div>
      <div class="card">
        <div class="card-header">
          <div class="skeleton skeleton-heading" style="width:140px"></div>
          <div class="skeleton" style="width:80px;height:24px;border-radius:var(--radius-full)"></div>
        </div>
        <div class="card-body">
          <div class="skeleton-table">${rows}</div>
        </div>
      </div>
    </div>
  `;
}

let currentSort = { field: 'name', dir: 'asc' };

export async function renderStudents() {
  const container = document.getElementById('app-content');

  container.innerHTML = `
    <div style="animation: fadeIn 0.5s ease-in-out;">
      <!-- Page Header -->
      <div class="flex justify-between items-center mb-2xl">
        <div>
          <h1 style="margin-bottom: 0.5rem;">Student Management</h1>
          <p style="margin: 0; color: var(--text-secondary);">Manage student records and information.</p>
        </div>
        <button class="btn btn-primary" id="addStudentBtn">
          <span class="icon">${Icons.plus}</span>
          Add New Student
        </button>
      </div>

      <!-- Search and Filter -->
      <div class="card mb-xl">
        <div class="card-body">
          <div class="flex gap-md items-center">
            <div class="form-group" style="margin-bottom: 0; flex: 2; min-width: 300px;">
              <div class="search-box">
                <span class="search-icon">${Icons.search}</span>
                <input
                  type="text"
                  id="studentSearch"
                  class="form-input"
                  placeholder="Search students (name, ID, email, program)..."
                />
              </div>
            </div>
            <div class="form-group" style="margin-bottom: 0; flex: 1; max-width: 200px;">
              <select id="statusFilter" class="form-select">
                <option value="active" selected>Active</option>
                <option value="inactive">Inactive</option>
                <option value="">All Status</option>
              </select>
            </div>
            <button class="btn btn-secondary" id="refreshStudentsBtn" style="padding: 0.75rem;">
              <span class="icon">${Icons.refresh}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Students Table -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Student Records</h3>
          <span class="badge badge-primary" id="studentCount">0 students</span>
        </div>
        <div class="card-body">
          <div id="studentsTableContainer"></div>
        </div>
      </div>
    </div>

    <style>
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

      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateX(-10px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      /* Table Typography consistency */
      .table th {
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-tertiary);
        padding: 1rem 1.5rem;
        font-weight: 700;
      }
      .table td {
        font-size: 0.9rem;
        padding: 1rem 1.5rem;
        vertical-align: middle;
        text-transform: uppercase;
        font-weight: 600;
      }
      .table .badge {
        font-size: 0.85rem;
        padding: 0.35rem 0.65rem;
      }
    </style>
  `;

  // Initialize the shared student detail modal
  initStudentDetailModal();

  // Load students
  await loadStudents();

  // Set up modal close callback to refresh list
  window.onStudentModalClose = async () => {
    await loadStudents();
  };

  // Debounce helper for search
  let searchTimeout;
  const debounceSearch = () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(loadStudents, 300);
  };

  // Attach event listeners
  document.getElementById('addStudentBtn').addEventListener('click', () => showStudentForm());
  document.getElementById('refreshStudentsBtn').addEventListener('click', loadStudents);
  document.getElementById('studentSearch').addEventListener('input', debounceSearch);
  document.getElementById('statusFilter').addEventListener('change', loadStudents);
}

/**
 * Load and display students
 */
async function loadStudents() {
  const search = document.getElementById('studentSearch')?.value || '';
  const statusFilterEl = document.getElementById('statusFilter');
  // Default to active if the select exists but is somehow empty during init, 
  // actually document.getElementById('statusFilter')?.value will be 'active' natively because of 'selected' attribute.
  const status = statusFilterEl ? statusFilterEl.value : 'active';

  const filters = {};
  if (search) filters.search = search;
  if (status) filters.status = status;

  let students = await Student.findAll(filters);

  // Sorting
  students.sort((a, b) => {
    // Priority 1: Search Relevance (if searching)
    if (search) {
      const lowerSearch = search.toLowerCase();
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      
      const aStarts = nameA.startsWith(lowerSearch);
      const bStarts = nameB.startsWith(lowerSearch);
      
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
    }

    // Priority 2: Selected Column
    let valA = a[currentSort.field] || '';
    let valB = b[currentSort.field] || '';

    if (currentSort.field === 'studentId') {
       // Numeric sort for IDs if possible, else string
       const numA = parseInt(valA.replace(/\D/g, ''));
       const numB = parseInt(valB.replace(/\D/g, ''));
       if (!isNaN(numA) && !isNaN(numB)) {
         valA = numA;
         valB = numB;
       }
    } else if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }

    if (valA < valB) return currentSort.dir === 'asc' ? -1 : 1;
    if (valA > valB) return currentSort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const container = document.getElementById('studentsTableContainer');
  const countBadge = document.getElementById('studentCount');

  if (countBadge) {
    countBadge.textContent = `${students.length} student${students.length !== 1 ? 's' : ''}`;
  }

  if (students.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem; color: var(--text-tertiary);">
        <div style="font-size: 3rem; margin-bottom: 1rem;">
          <span class="icon icon-xl" style="opacity: 0.5;">${Icons.users}</span>
        </div>
        <p style="font-size: var(--font-size-xl); margin-bottom: 0.75rem; color: var(--text-primary); font-weight: 700;">No students found</p>
        <p style="font-size: var(--font-size-sm);">Add your first student to get started!</p>
      </div>
    `;
    return;
  }

  const getSortIcon = (field) => {
    if (currentSort.field !== field) return '<span style="opacity: 0.3">↕</span>';
    return currentSort.dir === 'asc' ? '↑' : '↓';
  };

  container.innerHTML = `
    <div class="table-container" style="box-shadow: none;">
      <table class="table">
        <thead>
          <tr>
            <th width="50">#</th>
            <th style="cursor: pointer;" onclick="window.sortStudents('name')">Name ${getSortIcon('name')}</th>
            <th style="cursor: pointer;" onclick="window.sortStudents('program')">Programme ${getSortIcon('program')}</th>
            <th style="cursor: pointer;" onclick="window.sortStudents('course')">Course ${getSortIcon('course')}</th>
            <th style="cursor: pointer;" onclick="window.sortStudents('completionStatus')">Status ${getSortIcon('completionStatus')}</th>
            <th style="text-align: center;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${students.map((student, index) => `
            <tr style="animation: slideIn 0.3s ease-out ${index * 0.05}s both;">
              <td style="color: var(--text-tertiary); font-size: 0.85rem;">${index + 1}</td>
              <td style="font-weight: 500; color: var(--text-primary);">${escapeHtml(student.name)}</td>
              <td>${escapeHtml(student.program)}</td>
              <td><span class="badge badge-secondary">${escapeHtml(student.course || 'Other')}</span></td>
              <td>
                <span class="badge ${getCompletionStatusBadge(student.completionStatus)}">
                  ${escapeHtml(student.completionStatus || 'In Progress')}
                </span>
              </td>
              <td style="text-align: center;">
                <div class="flex gap-sm" style="justify-content: center;">
                  <button
                    class="btn btn-sm btn-primary"
                    onclick="window.viewStudent('${student.id}')"
                    style="width: 40px; height: 40px; padding: 0; border-radius: var(--radius-md);"
                    title="View & Edit Details"
                  >
                    <span class="icon">${Icons.eye}</span>
                  </button>
                  <button
                    class="btn btn-sm btn-danger"
                    onclick="window.deleteStudent('${student.id}')"
                    style="width: 40px; height: 40px; padding: 0; border-radius: var(--radius-md);"
                    title="Delete"
                  >
                    <span class="icon">${Icons.trash}</span>
                  </button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function getCompletionStatusBadge(status) {
  const map = {
    'In Progress': 'badge-primary',
    'Completed': 'badge-success',
    'Withdrawn': 'badge-danger',
    'Deferred': 'badge-warning'
  };
  return map[status] || 'badge-secondary';
}

/**
 * Auto-update student status based on completion date and validate date range
 */
window.autoUpdateStudentStatus = () => {
    const intakeMonth = document.getElementById('studentIntakeMonth')?.value;
    const intakeYear = document.getElementById('studentIntakeYear')?.value;
    const compMonth = document.getElementById('studentCompletionMonth')?.value;
    const compYear = document.getElementById('studentCompletionYear')?.value;
    const statusSelect = document.getElementById('studentCompletionStatus');
    const formError = document.getElementById('formError');
    
    if (!compMonth || !compYear || !statusSelect) return;
    
    const today = new Date();
    // Completion date is considered the LAST day of the selected month
    const completionDate = new Date(parseInt(compYear), parseInt(compMonth), 0);
    
    // Validate against intake date if set
    if (intakeMonth && intakeYear) {
        // Intake date is considered the FIRST day of the selected month
        const intakeDate = new Date(parseInt(intakeYear), parseInt(intakeMonth) - 1, 1);
        
        if (completionDate < intakeDate) {
            if (formError) {
                formError.textContent = 'Completion date cannot be before intake date.';
                formError.classList.remove('hidden');
            }
            // Optional: You might want to unset status or show it's invalid
            return;
        } else {
            // Only hide if it's OUR error message (don't hide errors from other fields)
            if (formError && formError.textContent === 'Completion date cannot be before intake date.') {
                formError.classList.add('hidden');
            }
        }
    }
    
    if (completionDate < today) {
        statusSelect.value = 'Completed';
    } else {
        statusSelect.value = 'In Progress';
    }
};

window.sortStudents = (field) => {
  if (currentSort.field === field) {
    currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.field = field;
    currentSort.dir = 'asc';
  }
  loadStudents();
};

/**
 * Show student form modal (add/edit)
 */
function showStudentForm(studentId = null) {
  const isEdit = studentId !== null;

  const modal = document.getElementById('modal-container');
  modal.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal-content" style="max-width: 900px; width: 95%; max-height: 90vh;">
        <div class="modal-header">
          <div class="modal-student-title">
            <h2 class="modal-title" style="margin: 0; display: flex; align-items: center; gap: 0.75rem;">
              ${isEdit ? 'Edit Student' : 'Add New Student'}
            </h2>
          </div>
          <div class="modal-header-actions">
            <button class="modal-close-btn" onclick="window.closeModal()" title="Close">
              <span class="icon">${Icons.close}</span>
            </button>
          </div>
        </div>
        <form id="studentForm" style="display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;">
          <div class="modal-body">
            <!-- Basic Info Section -->
            <div class="form-section mb-xl p-xl rounded-2xl" style="background: var(--glass-bg); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: none; box-shadow: none;">
              <h4 class="text-primary font-bold mb-md flex items-center gap-sm">
                <span class="icon icon-sm text-primary-600">${Icons.user}</span> Basic Information
              </h4>
              
              <div class="grid grid-3 gap-md">
                <div class="form-group" style="grid-column: span 1;">
                  <label class="form-label required">Student ID</label>
                  <input type="text" id="studentId" class="form-input" placeholder="e.g., S2024001" required />
                </div>
                <div class="form-group" style="grid-column: span 2;">
                  <label class="form-label required">Full Name</label>
                  <input type="text" id="studentName" class="form-input" placeholder="e.g., John Doe" required spellcheck="true" autocorrect="on" />
                </div>
              </div>

              <div class="grid grid-2 gap-md mt-md">
                <div class="form-group">
                  <label class="form-label">Course Type</label>
                  <select id="studentCourse" class="form-select" onchange="window.handleCourseSelectChange()">
                    <option value="">Select Course</option>
                    <option value="Diploma">Diploma</option>
                    <option value="BBA">BBA (Bachelor)</option>
                    <option value="MBA">MBA (Master)</option>
                    <option value="DBA">DBA (Doctorate)</option>
                    <option value="Other">Other</option>
                  </select>
                  <input type="text" id="studentCourseOther" class="form-input mt-sm hidden" placeholder="Enter new course type" spellcheck="true" autocorrect="on" />
                </div>
                <div class="form-group">
                  <label class="form-label">Programme</label>
                  <div class="flex gap-sm">
                    <select id="studentProgramSelect" class="form-select flex-1" onchange="window.handleProgramSelectChange()">
                      <option value="">Select Programme</option>
                    </select>
                    <button type="button" id="deleteProgramBtn" class="btn btn-sm btn-danger-light hidden" onclick="window.deleteSelectedProgramme()" title="Delete this programme">
                      <span class="icon icon-sm">${Icons.trash}</span>
                    </button>
                  </div>
                  <input type="text" id="studentProgramOther" class="form-input mt-sm hidden" placeholder="Enter new programme name" spellcheck="true" autocorrect="on" />
                </div>
              </div>

              <div class="grid grid-2 gap-md mt-md">
                <div class="form-group">
                  <label class="form-label">Email</label>
                  <input type="email" id="studentEmail" class="form-input" placeholder="student@example.com" />
                </div>
                <div class="form-group">
                  <label class="form-label">Phone</label>
                  <input type="tel" id="studentPhone" class="form-input" placeholder="+60123456789" />
                </div>
              </div>
            </div>

            <!-- Enrollment Section -->
            <div class="form-section mb-xl p-xl rounded-2xl" style="background: var(--glass-bg); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: none; box-shadow: none;">
              <h4 class="text-primary font-bold mb-md flex items-center gap-sm">
                <span class="icon icon-sm text-primary-600">
                  <svg viewBox="0 0 24 24" fill="none" class="icon-sm" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                </span> 
                Enrollment Details
              </h4>

              <div class="grid grid-3 gap-md">
                <div class="form-group">
                  <label class="form-label">Intake</label>
                  <div class="grid grid-2 gap-sm">
                    <select id="studentIntakeMonth" class="form-select bg-white" onchange="window.autoUpdateStudentStatus()"></select>
                    <select id="studentIntakeYear" class="form-select bg-white" onchange="window.autoUpdateStudentStatus()"></select>
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Completion Date</label>
                  <div class="grid grid-2 gap-sm">
                    <select id="studentCompletionMonth" class="form-select bg-white" onchange="window.autoUpdateStudentStatus()"></select>
                    <select id="studentCompletionYear" class="form-select bg-white" onchange="window.autoUpdateStudentStatus()"></select>
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Student Status</label>
                  <select id="studentCompletionStatus" class="form-select bg-white">
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="Withdrawn">Withdrawn</option>
                    <option value="Deferred">Deferred</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Financial Section -->
            <div class="form-section mb-xl p-xl rounded-2xl" style="background: var(--glass-bg); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: none; box-shadow: none;">
              <h4 class="text-primary font-bold mb-md flex items-center gap-sm">
                <span class="icon icon-sm text-primary-600">${Icons.dollarSign}</span> Financial Details
              </h4>

              <div class="grid grid-2 gap-md">
                <div class="form-group">
                  <label class="form-label">Total Fees (RM)</label>
                  <input type="number" id="studentTotalFees" class="form-input" min="0" step="0.01" placeholder="0.00" />
                </div>
                <div class="form-group">
                  <label class="form-label">Institutional Cost (RM)</label>
                  <input type="number" id="studentInstitutionalCost" class="form-input" min="0" step="0.01" placeholder="0.00" />
                </div>
              </div>

              <div class="grid grid-2 gap-md mt-md">
                <div class="form-group">
                  <label class="form-label">Registration Fee (RM)</label>
                  <div class="flex flex-col gap-sm">
                    <div class="grid" style="grid-template-columns: 1.2fr 1fr; gap: var(--space-sm);">
                      <input type="number" id="studentRegistrationFee" class="form-input" min="0" step="0.01" placeholder="0.00" />
                      <div id="regReceiptContainer"></div>
                    </div>
                    <select id="studentRegistrationFeeMethod" class="form-select">
                      <option value="" disabled selected>Payment Method</option>
                      <option value="cash">Cash</option>
                      <option value="online_banking">Online Banking</option>
                      <option value="bank_in">Bank-In</option>
                      <option value="card">Credit Card</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Commission (RM)</label>
                  <div class="flex flex-col gap-sm">
                    <div class="grid" style="grid-template-columns: 1.2fr 1fr; gap: var(--space-sm);">
                      <input type="number" id="studentCommission" class="form-input" min="0" step="0.01" placeholder="0.00" />
                      <div id="commReceiptContainer"></div>
                    </div>
                    <div class="grid" style="grid-template-columns: 1fr 1fr; gap: var(--space-sm);">
                      <select id="studentCommissionMethod" class="form-select">
                        <option value="" disabled selected>Payment Method</option>
                        <option value="cash">Cash</option>
                        <option value="online_banking">Online Banking</option>
                        <option value="bank_in">Bank-In</option>
                        <option value="card">Credit Card</option>
                        <option value="other">Other</option>
                      </select>
                      <input type="text" id="studentCommissionPaidTo" class="form-input" placeholder="Paid To" spellcheck="true" autocorrect="on" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="form-group mb-0">
              <label class="form-label">Remarks</label>
              <textarea id="studentRemarks" class="form-input" placeholder="Add any additional notes here..." rows="3" spellcheck="true" autocorrect="on"></textarea>
            </div>

            <div id="formError" class="form-error hidden mt-md p-md bg-danger-50 text-danger-700 rounded-md border border-danger-200"></div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-success">
              ${isEdit ? '💾 Update Student' : '➕ Add Student'}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Helper to generate date options
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentYear = new Date().getFullYear();
  const yearRange = 10; // +/- 10 years

  const populateDateSelects = (monthId, yearId) => {
    const monthSelect = document.getElementById(monthId);
    const yearSelect = document.getElementById(yearId);
    
    monthSelect.innerHTML = '<option value="">Month</option>' + 
      months.map((m, i) => `<option value="${(i+1).toString().padStart(2, '0')}">${m}</option>`).join('');
      
    let yearOpts = '<option value="">Year</option>';
    for (let i = currentYear - yearRange; i <= currentYear + yearRange; i++) {
      yearOpts += `<option value="${i}">${i}</option>`;
    }
    yearSelect.innerHTML = yearOpts;
  };

  populateDateSelects('studentIntakeMonth', 'studentIntakeYear');
  populateDateSelects('studentCompletionMonth', 'studentCompletionYear');

  // Initialize Smart Receipt Inputs
  renderReceiptInput('regReceiptContainer', {
    id: 'studentRegistrationFeeReceipt',
    placeholder: 'Receipt #',
    context: 'REG'
  });

  renderReceiptInput('commReceiptContainer', {
    id: 'studentCommissionReceipt',
    placeholder: 'Receipt #',
    context: 'COM'
  });

  // Helper to handle course selection and program options
  window.handleCourseSelectChange = async () => {
    const courseSelect = document.getElementById('studentCourse');
    const courseOtherInput = document.getElementById('studentCourseOther');
    
    if (courseSelect.value === 'Other') {
      courseOtherInput.classList.remove('hidden');
      courseOtherInput.focus();
    } else {
      courseOtherInput.classList.add('hidden');
    }
    
    await window.updateProgrammeOptions();
  };

  // Helper to update programme options
  window.updateProgrammeOptions = async (selectedProgram = null) => {
    const course = document.getElementById('studentCourse').value;
    const programSelect = document.getElementById('studentProgramSelect');
    const deleteBtn = document.getElementById('deleteProgramBtn');
    
    // Clear options
    programSelect.innerHTML = '<option value="">Select Programme</option>';
    
    // Hide delete button initially
    if(deleteBtn) deleteBtn.classList.add('hidden');
    
    let activeCourse = document.getElementById('studentCourse').value;
    if (activeCourse === 'Other') {
      activeCourse = document.getElementById('studentCourseOther').value.trim();
    }

    if (activeCourse) {
      const programmes = await Programme.findByCourse(activeCourse);
      programmes.forEach(p => {
        programSelect.innerHTML += `<option value="${p.name}">${p.name}</option>`;
      });
    }
    
    programSelect.innerHTML += '<option value="Other">Other (Add New)</option>';
    
    if (selectedProgram) {
      // Check if selected program exists in options
      const exists = Array.from(programSelect.options).some(opt => opt.value === selectedProgram);
      if (exists) {
        programSelect.value = selectedProgram;
      } else {
        // If it's a value from DB but not in our filtered list (edge case), or logic mismatch
        // check if it matches "Other" logic? 
        // For now, if it's not in the list, we assume it's custom or "Other" was meant
        programSelect.value = 'Other';
        document.getElementById('studentProgramOther').value = selectedProgram;
        document.getElementById('studentProgramOther').classList.remove('hidden');
      }
    }
    
    // Trigger handle change to set UI state
    window.handleProgramSelectChange();
  };

  // Handle program select change
  window.handleProgramSelectChange = () => {
    const val = document.getElementById('studentProgramSelect').value;
    const input = document.getElementById('studentProgramOther');
    const deleteBtn = document.getElementById('deleteProgramBtn');
    
    if (val === 'Other') {
      input.classList.remove('hidden');
      input.focus();
      if(deleteBtn) deleteBtn.classList.add('hidden');
    } else {
      input.classList.add('hidden');
      // Show delete button if value is selected and it's not empty
      if (val && deleteBtn) {
         deleteBtn.classList.remove('hidden');
      } else if (deleteBtn) {
         deleteBtn.classList.add('hidden');
      }
    }
  };

  // Delete selected programme
  window.deleteSelectedProgramme = async () => {
    const programName = document.getElementById('studentProgramSelect').value;
    if (!programName || programName === 'Other') return;

    if (confirm(`Are you sure you want to delete the programme "${programName}"? This will remove it from the list of options.`)) {
      try {
        const deleted = await Programme.deleteByName(programName);
        if (deleted) {
           await window.updateProgrammeOptions();
           // Optional: Reset selection or notify
        } else {
           alert('Could not delete programme.');
        }
      } catch (err) {
        console.error(err);
        alert('Error deleting programme: ' + err.message);
      }
    }
  };

  // If editing, load student data
  if (isEdit) {
    loadStudentData(studentId);
  } else {
    // Just trigger update for empty form
    window.updateProgrammeOptions();
  }

  // Form submission
  document.getElementById('studentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveStudent(studentId);
  });
}

/**
 * Load student data for editing
 */
async function loadStudentData(studentId) {
  // Coerce string IDs to numbers (HTML data-attributes and some call-sites pass strings)
  const numericId = Number(studentId);
  const lookupId = (!isNaN(numericId) && numericId) ? numericId : studentId;

  if (!lookupId) {
    console.error('Invalid student ID:', studentId);
    return;
  }
  
  const student = await Student.findById(lookupId);
  if (!student) return;

  document.getElementById('studentId').value = student.studentId;
  document.getElementById('studentName').value = student.name;
  
  // Set Course
  const courseSelect = document.getElementById('studentCourse');
  const courseOptions = Array.from(courseSelect.options).map(opt => opt.value);
  if (student.course && !courseOptions.includes(student.course)) {
    courseSelect.value = 'Other';
    const courseOtherInput = document.getElementById('studentCourseOther');
    courseOtherInput.value = student.course;
    courseOtherInput.classList.remove('hidden');
  } else {
    courseSelect.value = student.course || '';
  }
  
  // Load programmes for this course then set value
  await window.updateProgrammeOptions(student.program);
  document.getElementById('studentEmail').value = student.email || '';
  document.getElementById('studentPhone').value = student.phone || '';
  // Parse and set date selectors
  const setDateSelectors = (dateStr, monthId, yearId) => {
    if (!dateStr) return;
    try {
      // Handle both YYYY-MM and existing text formats if necessary
      if (dateStr.includes('-')) {
        const [year, month] = dateStr.split('-');
        document.getElementById(yearId).value = year;
        document.getElementById(monthId).value = month;
      } else {
        // Fallback for messy data, try basic parsing
        // For now assume YYYY-MM which is standard in our new system
      }
    } catch (e) { console.error('Error parsing date', e); }
  };

  setDateSelectors(student.intake, 'studentIntakeMonth', 'studentIntakeYear');
  setDateSelectors(student.completionDate, 'studentCompletionMonth', 'studentCompletionYear');

  document.getElementById('studentCompletionStatus').value = student.completionStatus || 'In Progress';
  document.getElementById('studentTotalFees').value = student.totalFees || '';
  document.getElementById('studentInstitutionalCost').value = student.institutionalCost || '';
  document.getElementById('studentRegistrationFee').value = student.registrationFee || '';
  document.getElementById('studentRegistrationFeeReceipt').value = student.registrationFeeReceipt || '';
  document.getElementById('studentRegistrationFeeMethod').value = student.registrationFeeMethod || '';
  document.getElementById('studentCommission').value = student.commission || '';
  document.getElementById('studentCommissionReceipt').value = student.commissionReceipt || '';
  document.getElementById('studentCommissionMethod').value = student.commissionMethod || '';
  document.getElementById('studentCommissionPaidTo').value = student.commissionPaidTo || '';
  document.getElementById('studentRemarks').value = student.remarks || '';
}

/**
 * Save student (create or update)
 */
async function saveStudent(studentId) {
  const formError = document.getElementById('formError');
  formError.classList.add('hidden');

  try {
    let program = document.getElementById('studentProgramSelect').value;
    if (program === 'Other') {
      program = document.getElementById('studentProgramOther').value.trim();
    }

    let course = document.getElementById('studentCourse').value;
    if (course === 'Other') {
      course = document.getElementById('studentCourseOther').value.trim();
    }

    // Validate
    if (!program) throw new Error('Programme is required');
    if (!course) throw new Error('Course is required');

    // Create program if new
    if (document.getElementById('studentProgramSelect').value === 'Other') {
      await Programme.getOrCreate(program, course);
    }

    // Combine date selectors
    const intakeDateStr = getCombinedDate('studentIntakeMonth', 'studentIntakeYear');
    const completionDateStr = getCombinedDate('studentCompletionMonth', 'studentCompletionYear');

    // Date validation
    if (intakeDateStr && completionDateStr) {
        const [iY, iM] = intakeDateStr.split('-');
        const [cY, cM] = completionDateStr.split('-');
        const intakeDate = new Date(parseInt(iY), parseInt(iM) - 1, 1);
        const completionDate = new Date(parseInt(cY), parseInt(cM), 0);
        
        if (completionDate < intakeDate) {
            throw new Error('Completion date cannot be before intake date.');
        }
    }

    const regFee = document.getElementById('studentRegistrationFee').value || 0;
    let regReceipt = document.getElementById('studentRegistrationFeeReceipt').value.trim();
    
    const commFee = document.getElementById('studentCommission').value || 0;
    let commReceipt = document.getElementById('studentCommissionReceipt').value.trim();

    // Auto-generate receipts if not provided but amount exists
    if (parseFloat(regFee) > 0 && !regReceipt) {
      regReceipt = await Receipt.getNextReceiptNumber('REG');
    }
    if (parseFloat(commFee) > 0 && !commReceipt) {
      commReceipt = await Receipt.getNextReceiptNumber('COM');
    }

    const studentData = {
      studentId: document.getElementById('studentId').value.trim(),
      name: document.getElementById('studentName').value.trim(),
      program: program,
      course: course,
      email: document.getElementById('studentEmail').value.trim(),
      phone: document.getElementById('studentPhone').value.trim(),
      intake: intakeDateStr,
      completionDate: completionDateStr,
      completionStatus: document.getElementById('studentCompletionStatus').value,
      status: 'active', // Default to active since field removed
      totalFees: document.getElementById('studentTotalFees').value || 0,
      institutionalCost: document.getElementById('studentInstitutionalCost').value || 0,
      registrationFee: regFee,
      registrationFeeReceipt: regReceipt,
      registrationFeeMethod: document.getElementById('studentRegistrationFeeMethod').value,
      commission: commFee,
      commissionReceipt: commReceipt,
      commissionMethod: document.getElementById('studentCommissionMethod').value,
      commissionPaidTo: document.getElementById('studentCommissionPaidTo').value.trim(),
      remarks: document.getElementById('studentRemarks').value.trim()
    };

    let savedStudentDbId;
    if (studentId) {
      await Student.update(studentId, studentData);
      savedStudentDbId = studentId;
    } else {
      savedStudentDbId = await Student.create(studentData);
    }

    // ═══ AUTO-CREATE PAYMENT RECORDS FOR REG/COMMISSION FEES ═══
    const numericRegFee = parseFloat(regFee) || 0;
    const numericCommFee = parseFloat(commFee) || 0;

    // Registration Fee → Payment record (REVENUE)
    if (numericRegFee > 0 && regReceipt) {
      const existing = await Payment.findByReference(regReceipt);
      if (existing) {
        // Update existing payment if amount or details changed
        await Payment.update(existing.id, {
          amount: numericRegFee,
          description: 'Registration Fee',
          date: existing.date // keep original date
        });
      } else {
        await Payment.create({
          studentId: savedStudentDbId,
          amount: numericRegFee,
          date: new Date().toISOString(),
          method: studentData.registrationFeeMethod || 'cash',
          reference: regReceipt,
          description: 'Registration Fee',
          transactionType: 'REGISTRATION_FEE',
          category: 'REVENUE'
        });
      }
    }

    // Commission Fee → Payment record (EXPENSE)
    if (numericCommFee > 0 && commReceipt) {
      const existing = await Payment.findByReference(commReceipt);
      const paidTo = document.getElementById('studentCommissionPaidTo').value.trim();
      if (existing) {
        await Payment.update(existing.id, {
          amount: numericCommFee,
          description: `Commission Payout${paidTo ? ' - ' + paidTo : ''}`,
          recipient: paidTo,
          date: existing.date
        });
      } else {
        await Payment.create({
          studentId: savedStudentDbId,
          amount: numericCommFee,
          date: new Date().toISOString(),
          method: studentData.commissionMethod || 'cash',
          reference: commReceipt,
          description: `Commission Payout${paidTo ? ' - ' + paidTo : ''}`,
          transactionType: 'COMMISSION_PAYOUT',
          category: 'EXPENSE',
          recipient: paidTo
        });
      }
    }

    window.closeModal();
    await loadStudents();
    showNotification(studentId ? 'Student updated successfully!' : 'Student added successfully!', 'success');
  } catch (error) {
    if (formError) {
      formError.textContent = error.message;
      formError.classList.remove('hidden');
    } else {
      alert(error.message);
    }
  }
}

/**
 * View student details using shared modal
 */
async function viewStudent(studentId) {
  const student = await Student.findById(studentId);
  if (!student) return;

  await openStudentDetailModal(student);
}

/**
 * Delete (deactivate) student — Optimistic UI
 */
async function deleteStudent(studentId) {
  if (!confirm('Are you sure you want to delete this student?')) return;

  // Find the row in the DOM
  const btn = document.querySelector(`button[onclick="window.deleteStudent('${studentId}')"]`);
  const row = btn?.closest('tr');

  if (row) {
    await optimisticRemove(row, () => Student.delete(studentId), {
      successMsg: 'Student deleted!',
      errorMsg: 'Failed to delete. Reverted.'
    });
    // Update count badge
    const countBadge = document.getElementById('studentCount');
    if (countBadge) {
      const remaining = document.querySelectorAll('#studentsTableContainer tbody tr').length;
      countBadge.textContent = `${remaining} student${remaining !== 1 ? 's' : ''}`;
    }
  } else {
    // Fallback
    try {
      await Student.delete(studentId);
      await loadStudents();
      showToast('Student deleted!', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
  // Simple alert for now - can be enhanced with toast notifications
  alert(message);
}

// Export global functions
window.viewStudent = viewStudent;
window.editStudent = showStudentForm;
window.deleteStudent = deleteStudent;
window.closeModal = () => {
  document.getElementById('modal-container').innerHTML = '';
};
