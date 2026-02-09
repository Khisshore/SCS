/**
 * SCS - CENTRALIZED LOGGING SERVICE
 * Uses electron-log for robust file-based logging in production
 */

const log = require('electron-log');
const path = require('path');

// Configure log format
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

// Set log file location (default is %AppData%/SCS/logs/main.log)
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// Handle specific production/dev logic
const isDev = process.env.NODE_ENV === 'development';

if (!isDev) {
  // In production, we want to ensure we catch everything
  log.errorHandler.startCatching();
}

/**
 * Logger Wrapper
 */
const logger = {
  info: (msg, ...args) => log.info(msg, ...args),
  warn: (msg, ...args) => log.warn(msg, ...args),
  error: (msg, ...args) => log.error(msg, ...args),
  debug: (msg, ...args) => log.debug(msg, ...args),
  
  // Method to get log file path for help/support
  getLogPath: () => log.transports.file.getFile().path
};

module.exports = logger;
