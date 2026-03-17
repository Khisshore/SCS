/**
 * RXDB SCHEMAS
 * Defines the structure for all collections in the reactive database
 */

export const StudentSchema = {
  title: 'student schema',
  version: 1,
  description: 'describes a student',
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    studentId: { type: 'string', maxLength: 100 },
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
    registrationFeeMethod: { type: 'string' },
    commission: { type: 'number' },
    commissionReceipt: { type: 'string' },
    commissionMethod: { type: 'string' },
    commissionPaidTo: { type: 'string' },
    totalSemesters: { type: 'integer' },
    remarks: { type: 'string' },
    status: { type: 'string', maxLength: 100 },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time', maxLength: 100 }
  },
  required: ['id', 'studentId', 'name', 'program', 'status', 'updatedAt'],
  indexes: ['studentId', 'status', 'updatedAt']
};

export const PaymentSchema = {
  title: 'payment schema',
  version: 1,
  description: 'describes a payment/transaction',
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    studentId: { type: 'string', maxLength: 100 },
    amount: { type: ['number', 'null'] },
    date: { type: 'string', format: 'date-time', maxLength: 100 },
    method: { type: 'string', maxLength: 100 },
    semester: { type: ['string', 'null'], maxLength: 100 },
    reference: { type: 'string' }, // maps to receipt_id
    remarks: { type: 'string' },
    description: { type: 'string' },
    transactionType: { type: 'string' }, // more flexible
    category: { type: 'string', enum: ['REVENUE', 'EXPENSE'] },
    recipient: { type: 'string' }, // for EXPENSE types
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time', maxLength: 100 }
  },
  required: ['id', 'studentId', 'date', 'method', 'updatedAt'],
  indexes: ['studentId', 'date', 'method', 'updatedAt']
};

export const ReceiptSchema = {
  title: 'receipt schema',
  version: 1,
  description: 'describes a receipt',
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    paymentId: { type: 'string', maxLength: 100 },
    receiptNumber: { type: 'string', maxLength: 100 },
    date: { type: 'string', format: 'date-time' },
    pdfPath: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time', maxLength: 100 }
  },
  required: ['id', 'paymentId', 'receiptNumber', 'updatedAt'],
  indexes: ['paymentId', 'receiptNumber', 'updatedAt']
};

export const SettingSchema = {
  title: 'setting schema',
  version: 1,
  description: 'describes a system setting',
  primaryKey: 'key',
  type: 'object',
  properties: {
    key: { type: 'string', maxLength: 100 },
    value: { type: ['string', 'number', 'boolean', 'object', 'null'] },
    updatedAt: { type: 'string', format: 'date-time', maxLength: 100 }
  },
  required: ['key', 'updatedAt'],
  indexes: ['updatedAt']
};

export const FileMetadataSchema = {
  title: 'file metadata schema',
  version: 1,
  description: 'describes metadata for a stored file',
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    filePath: { type: 'string', maxLength: 100 },
    fileName: { type: 'string' },
    studentName: { type: 'string', maxLength: 100 },
    course: { type: 'string', maxLength: 100 },
    semester: { type: 'string', maxLength: 100 },
    fileSize: { type: 'number' },
    createdDate: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time', maxLength: 100 }
  },
  required: ['id', 'filePath', 'fileName', 'studentName', 'course', 'semester', 'updatedAt'],
  indexes: ['filePath', 'studentName', 'course', 'semester', 'updatedAt']
};

export const StudentRemarksSchema = {
  title: 'student remarks schema',
  version: 1,
  description: 'describes remarks for a student',
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    studentId: { type: 'string', maxLength: 100 },
    remarks: { type: 'string' },
    updatedAt: { type: 'string', format: 'date-time', maxLength: 100 }
  },
  required: ['id', 'studentId', 'updatedAt'],
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
    course: { type: 'string', maxLength: 100 },
    name: { type: 'string', maxLength: 100 },
    updatedAt: { type: 'string', format: 'date-time', maxLength: 100 }
  },
  required: ['id', 'name', 'course', 'updatedAt'],
  indexes: ['course', 'name', 'updatedAt']
};
