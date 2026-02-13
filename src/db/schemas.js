/**
 * RXDB SCHEMAS
 * Defines the structure for all collections in the reactive database
 */

export const StudentSchema = {
  title: 'student schema',
  version: 0,
  description: 'describes a student',
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    studentId: { type: 'string' },
    name: { type: 'string' },
    email: { type: 'string' },
    phone: { type: 'string' },
    program: { type: 'string' },
    institution: { type: 'string' },
    course: { type: 'string' },
    intake: { type: 'string' },
    completionDate: { type: 'string' },
    completionStatus: { type: 'string' },
    totalFees: { type: 'number' },
    institutionalCost: { type: 'number' },
    registrationFee: { type: 'number' },
    registrationFeeReceipt: { type: 'string' },
    commission: { type: 'number' },
    commissionReceipt: { type: 'string' },
    commissionPaidTo: { type: 'string' },
    totalSemesters: { type: 'integer' },
    status: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  },
  required: ['id', 'studentId', 'name', 'program'],
  indexes: ['studentId', 'email', 'status', 'updatedAt']
};

export const PaymentSchema = {
  title: 'payment schema',
  version: 0,
  description: 'describes a payment',
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    studentId: { type: 'string' },
    amount: { type: 'number' },
    date: { type: 'string', format: 'date-time' },
    method: { type: 'string' },
    semester: { type: 'string' },
    reference: { type: 'string' },
    remarks: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  },
  required: ['id', 'studentId', 'amount', 'date', 'semester'],
  indexes: ['studentId', 'date', 'method', 'semester', 'updatedAt']
};

export const ReceiptSchema = {
  title: 'receipt schema',
  version: 0,
  description: 'describes a receipt',
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    paymentId: { type: 'string' },
    receiptNumber: { type: 'string' },
    date: { type: 'string', format: 'date-time' },
    pdfPath: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  },
  required: ['id', 'paymentId', 'receiptNumber'],
  indexes: ['paymentId', 'receiptNumber', 'updatedAt']
};

export const SettingSchema = {
  title: 'setting schema',
  version: 0,
  description: 'describes a system setting',
  primaryKey: 'key',
  type: 'object',
  properties: {
    key: { type: 'string', maxLength: 100 },
    value: { type: ['string', 'number', 'boolean', 'object', 'null'] },
    updatedAt: { type: 'string', format: 'date-time' }
  },
  required: ['key'],
  indexes: ['updatedAt']
};

export const FileMetadataSchema = {
  title: 'file metadata schema',
  version: 0,
  description: 'describes metadata for a stored file',
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    filePath: { type: 'string' },
    fileName: { type: 'string' },
    studentName: { type: 'string' },
    course: { type: 'string' },
    semester: { type: 'string' },
    fileSize: { type: 'number' },
    createdDate: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  },
  required: ['id', 'filePath', 'fileName'],
  indexes: ['filePath', 'studentName', 'course', 'semester', 'updatedAt']
};

export const StudentRemarksSchema = {
  title: 'student remarks schema',
  version: 0,
  description: 'describes remarks for a student',
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    studentId: { type: 'string' },
    remarks: { type: 'string' },
    updatedAt: { type: 'string', format: 'date-time' }
  },
  required: ['id', 'studentId'],
  indexes: ['studentId', 'updatedAt']
};

export const ProgrammeSchema = {
  title: 'programme schema',
  version: 0,
  description: 'describes an educational programme',
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    course: { type: 'string' },
    name: { type: 'string' },
    updatedAt: { type: 'string', format: 'date-time' }
  },
  required: ['id', 'name'],
  indexes: ['course', 'name', 'updatedAt']
};
