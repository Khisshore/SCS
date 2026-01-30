import { validateStudentId, validateEmail, validatePhone, validateAmount, validateDate, validatePaymentMethod } from '../src/utils/validators.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

function assertThrows(fn, message) {
  try {
    fn();
    console.error(`❌ FAIL: ${message} (Expected error but none thrown)`);
    failed++;
  } catch (e) {
    console.log(`✅ PASS: ${message} (Caught: ${e.message})`);
    passed++;
  }
}

function assertNotThrows(fn, message) {
  try {
    fn();
    console.log(`✅ PASS: ${message}`);
    passed++;
  } catch (e) {
    console.error(`❌ FAIL: ${message} (Threw: ${e.message})`);
    failed++;
  }
}

console.log('Running Validation Tests...\n');

// Student ID
assertThrows(() => validateStudentId(null), 'Student ID null');
assertThrows(() => validateStudentId(''), 'Student ID empty');
assertThrows(() => validateStudentId('S123!'), 'Student ID with special chars');
assertNotThrows(() => validateStudentId('S123'), 'Valid Student ID');

// Email
assertThrows(() => validateEmail('invalid-email'), 'Invalid Email');
assertThrows(() => validateEmail('user@domain'), 'Invalid Email (no TLD)');
assertNotThrows(() => validateEmail('user@example.com'), 'Valid Email');
assertNotThrows(() => validateEmail(''), 'Empty Email (Optional)');

// Phone
assertThrows(() => validatePhone('123abc456'), 'Phone with letters');
assertNotThrows(() => validatePhone('+123 456-7890'), 'Valid Phone');
assertNotThrows(() => validatePhone(''), 'Empty Phone (Optional)');

// Amount
assertThrows(() => validateAmount(-10, false), 'Negative amount (not allowed)');
assertThrows(() => validateAmount(0, false), 'Zero amount (not allowed)');
assertThrows(() => validateAmount('abc', false), 'NaN amount');
assertNotThrows(() => validateAmount(100, false), 'Positive amount');
assertNotThrows(() => validateAmount('100.50', false), 'Positive amount string');
assertNotThrows(() => validateAmount(0, true), 'Zero amount (allowed)');

// Payment Method
assertThrows(() => validatePaymentMethod('bitcoin'), 'Invalid Payment Method');
assertNotThrows(() => validatePaymentMethod('cash'), 'Valid Payment Method');

// Date
assertThrows(() => validateDate('invalid-date'), 'Invalid Date');
assertNotThrows(() => validateDate('2023-01-01'), 'Valid Date');

console.log(`\nTests Completed: ${passed} Passed, ${failed} Failed.`);
if (failed > 0) process.exit(1);
