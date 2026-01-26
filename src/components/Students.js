/**
 * STUDENTS COMPONENT
 * Student management interface
 */

import { Student } from '../models/Student.js';
import { Payment } from '../models/Payment.js';
import { Icons } from '../utils/icons.js';
import { formatDate } from '../utils/formatting.js';

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
          <div class="grid grid-4 gap-md">
            <div class="form-group" style="margin-bottom: 0; grid-column: span 2;">
              <input
                type="text"
                id="studentSearch"
                class="form-input"
                placeholder="🔍 Search students (name, ID, email, program)..."
              />
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <select id="statusFilter" class="form-select">
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <button class="btn btn-secondary" id="refreshStudentsBtn" style="padding-left: 1rem; padding-right: 1rem;">
              <span class="icon icon-sm">${Icons.refresh}</span>
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
    </style>
  `;

  // Load students
  await loadStudents();

  // Debounce helper for search
  let searchTimeout;
  const debounceSearch = () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(loadStudents, 300);
  };

  // Attach event listeners
  document.getElementById('addStudentBtn').addEventListener('click', showStudentForm);
  document.getElementById('refreshStudentsBtn').addEventListener('click', loadStudents);
  document.getElementById('studentSearch').addEventListener('input', debounceSearch);
  document.getElementById('statusFilter').addEventListener('change', loadStudents);
}

/**
 * Load and display students
 */
async function loadStudents() {
  const search = document.getElementById('studentSearch')?.value || '';
  const status = document.getElementById('statusFilter')?.value || '';

  const filters = {};
  if (search) filters.search = search;
  if (status) filters.status = status;

  const students = await Student.findAll(filters);

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
        <p style="font-size: var(--font-size-lg); margin-bottom: 0.5rem;">No students found</p>
        <p style="font-size: var(--font-size-sm);">Add your first student to get started!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="table-container" style="box-shadow: none;">
      <table class="table">
        <thead>
          <tr>
            <th>Student ID</th>
            <th>Name</th>
            <th>Program</th>
            <th>Contact</th>
            <th>Status</th>
            <th>Created</th>
            <th style="text-align: center;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${students.map((student, index) => `
            <tr style="animation: slideIn 0.3s ease-out ${index * 0.05}s both;">
              <td><strong>${student.studentId}</strong></td>
              <td>${student.name}</td>
              <td>${student.program}</td>
              <td>
                ${student.email ? `<div style="font-size: var(--font-size-sm);">${student.email}</div>` : ''}
                ${student.phone ? `<div style="font-size: var(--font-size-sm);">${student.phone}</div>` : ''}
                ${!student.email && !student.phone ? '<span style="color: var(--text-tertiary);">-</span>' : ''}
              </td>
              <td>
                <span class="badge ${student.status === 'active' ? 'badge-success' : 'badge-danger'}">
                  ${student.status}
                </span>
              </td>
              <td style="color: var(--text-tertiary); font-size: var(--font-size-sm);">
                ${formatDate(student.createdAt, 'short')}
              </td>
              <td style="text-align: center;">
                <div class="flex gap-sm" style="justify-content: center;">
                  <button
                    class="btn btn-sm btn-primary"
                    onclick="window.viewStudent(${student.id})"
                    title="View Details"
                  >
                    <span class="icon icon-sm">${Icons.eye}</span>
                  </button>
                  <button
                    class="btn btn-sm btn-secondary"
                    onclick="window.editStudent(${student.id})"
                    title="Edit"
                  >
                    <span class="icon icon-sm">${Icons.edit}</span>
                  </button>
                  <button
                    class="btn btn-sm btn-danger"
                    onclick="window.deleteStudent(${student.id})"
                    title="Deactivate"
                  >
                    <span class="icon icon-sm">${Icons.trash}</span>
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

/**
 * Show student form modal (add/edit)
 */
function showStudentForm(studentId = null) {
  const isEdit = studentId !== null;

  const modal = document.getElementById('modal-container');
  modal.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">${isEdit ? 'Edit Student' : 'Add New Student'}</h2>
          <button class="modal-close" onclick="window.closeModal()">×</button>
        </div>
        <form id="studentForm">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label required">Student ID</label>
              <input type="text" id="studentId" class="form-input" required placeholder="e.g., S2024001" autofocus />
              <div class="form-help">Unique identifier for the student</div>
            </div>

            <div class="form-group">
              <label class="form-label required">Full Name</label>
              <input type="text" id="studentName" class="form-input" required placeholder="e.g., John Doe" />
            </div>

            <div class="form-group">
              <label class="form-label required">Program/Course</label>
              <input type="text" id="studentProgram" class="form-input" required placeholder="e.g., Computer Science" />
            </div>

            <div class="grid grid-2 gap-md">
              <div class="form-group">
                <label class="form-label">Email</label>
                <input type="email" id="studentEmail" class="form-input" placeholder="student@example.com" />
              </div>

              <div class="form-group">
                <label class="form-label">Phone</label>
                <input type="tel" id="studentPhone" class="form-input" placeholder="+60123456789" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Status</label>
              <select id="studentStatus" class="form-select">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div id="formError" class="form-error hidden"></div>
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

  // If editing, load student data
  if (isEdit) {
    loadStudentData(studentId);
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
  // Validate studentId
  if (!studentId || typeof studentId !== 'number') {
    console.error('Invalid student ID:', studentId);
    return;
  }
  
  const student = await Student.findById(studentId);
  if (!student) return;

  document.getElementById('studentId').value = student.studentId;
  document.getElementById('studentName').value = student.name;
  document.getElementById('studentProgram').value = student.program;
  document.getElementById('studentEmail').value = student.email || '';
  document.getElementById('studentPhone').value = student.phone || '';
  document.getElementById('studentStatus').value = student.status;
}

/**
 * Save student (create or update)
 */
async function saveStudent(studentId) {
  const formError = document.getElementById('formError');
  formError.classList.add('hidden');

  const studentData = {
    studentId: document.getElementById('studentId').value.trim(),
    name: document.getElementById('studentName').value.trim(),
    program: document.getElementById('studentProgram').value.trim(),
    email: document.getElementById('studentEmail').value.trim(),
    phone: document.getElementById('studentPhone').value.trim(),
    status: document.getElementById('studentStatus').value
  };

  try {
    if (studentId) {
      await Student.update(studentId, studentData);
    } else {
      await Student.create(studentData);
    }

    window.closeModal();
    await loadStudents();
    showNotification(studentId ? 'Student updated successfully!' : 'Student added successfully!', 'success');
  } catch (error) {
    formError.textContent = error.message;
    formError.classList.remove('hidden');
  }
}

/**
 * View student details
 */
async function viewStudent(studentId) {
  const student = await Student.findById(studentId);
  if (!student) return;

  const payments = await Payment.findByStudent(student.studentId);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  const modal = document.getElementById('modal-container');
  modal.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" style="max-width: 800px;">
        <div class="modal-header">
          <h2 class="modal-title">Student Details</h2>
          <button class="modal-close" onclick="window.closeModal()">×</button>
        </div>
        <div class="modal-body">
          <div class="grid grid-2 gap-lg mb-lg">
            <div>
              <h4>Personal Information</h4>
              <div style="background: var(--gray-50); padding: 1rem; border-radius: var(--radius-lg);">
                <p><strong>Student ID:</strong> ${student.studentId}</p>
                <p><strong>Name:</strong> ${student.name}</p>
                <p><strong>Program:</strong> ${student.program}</p>
                <p><strong>Email:</strong> ${student.email || 'N/A'}</p>
                <p><strong>Phone:</strong> ${student.phone || 'N/A'}</p>
                <p><strong>Status:</strong> <span class="badge ${student.status === 'active' ? 'badge-success' : 'badge-danger'}">${student.status}</span></p>
              </div>
            </div>
            <div>
              <h4>Payment Summary</h4>
              <div style="background: var(--primary-50); padding: 1rem; border-radius: var(--radius-lg);">
                <p><strong>Total Payments:</strong> ${payments.length}</p>
                <p><strong>Total Amount:</strong> MYR ${totalPaid.toFixed(2)}</p>
                <p><strong>Last Payment:</strong> ${payments[0] ? formatDate(payments[0].date, 'short') : 'N/A'}</p>
              </div>
            </div>
          </div>

          <h4>Payment History</h4>
          ${payments.length > 0 ? `
            <div class="table-container" style="max-height: 300px; overflow-y: auto;">
              <table class="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  ${payments.map(payment => `
                    <tr>
                      <td>${formatDate(payment.date, 'short')}</td>
                      <td><strong>MYR ${payment.amount.toFixed(2)}</strong></td>
                      <td><span class="badge badge-primary">${payment.method}</span></td>
                      <td>${payment.description || '-'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : '<p style="text-align: center; color: var(--text-tertiary); padding: 2rem;">No payment history</p>'}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="window.closeModal()">Close</button>
          <button class="btn btn-primary" onclick="window.closeModal(); window.editStudent(${student.id})">Edit Student</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Delete (deactivate) student
 */
async function deleteStudent(studentId) {
  if (!confirm('Are you sure you want to deactivate this student?')) return;

  try {
    await Student.delete(studentId);
    await loadStudents();
    showNotification('Student deactivated successfully!', 'success');
  } catch (error) {
    showNotification(error.message, 'error');
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
