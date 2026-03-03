/**
 * OLLAMA LIFECYCLE MANAGER
 * Manages the local Ollama AI server as a sidecar process.
 * - Auto-detects existing Ollama installations
 * - Starts/stops the server with the app
 * - Pulls required models on first launch
 * - Provides health checks and status updates
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const http = require('http');
const logger = require('./logger');

const OLLAMA_HOST = '127.0.0.1';
const OLLAMA_PORT = 11434;
const OLLAMA_BASE = `http://${OLLAMA_HOST}:${OLLAMA_PORT}`;
const REQUIRED_MODEL = 'qwen2.5:3b';

let ollamaProcess = null;
let currentStatus = 'stopped'; // stopped | starting | ready | pulling | error
let pullProgress = null;
let restartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 3;
let healthCheckInterval = null;
let statusCallback = null;
let isInitializing = false;

/**
 * Update status and notify callback
 */
function setStatus(status) {
  currentStatus = status;
  if (statusCallback) statusCallback(status);
}

/**
 * Make an HTTP request to the Ollama API (no external dependencies)
 */
function ollamaRequest(method, endpoint, body = null, stream = false) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, OLLAMA_BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 120000, // 120s — large JSON payloads need more time
    };

    const req = http.request(options, (res) => {
      if (stream) {
        resolve(res); // Return the raw stream for streaming responses
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Ollama request timeout')); });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Check if Ollama is already running (user-installed or our sidecar)
 */
async function isOllamaRunning() {
  try {
    const res = await ollamaRequest('GET', '/api/tags');
    return !!res;
  } catch {
    return false;
  }
}

/**
 * Find the Ollama binary on the system
 */
function findOllamaBinary() {
  // 1. Check common install locations
  const possiblePaths = [
    // Windows default install
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Ollama', 'ollama.exe'),
    // Bundled with our app (for distribution)
    path.join(process.resourcesPath || '', 'ollama', 'ollama.exe'),
  ];

  for (const p of possiblePaths) {
    try {
      const fs = require('fs');
      if (fs.existsSync(p)) {
        logger.info(`Found Ollama binary at: ${p}`);
        return p;
      }
    } catch { /* skip */ }
  }

  // 2. Check if 'ollama' is in PATH
  try {
    const result = execSync('where ollama', { encoding: 'utf-8', timeout: 5000 }).trim();
    if (result) {
      logger.info(`Found Ollama in PATH: ${result.split('\n')[0]}`);
      return result.split('\n')[0].trim();
    }
  } catch { /* not in PATH */ }

  return null;
}

/**
 * Start the Ollama server
 */
async function startOllama() {
  // Already running? Just use it.
  if (await isOllamaRunning()) {
    logger.info('✅ Ollama is already running, reusing existing instance');
    setStatus('ready');
    return true;
  }

  const binary = findOllamaBinary();
  if (!binary) {
    currentStatus = 'error';
    logger.error('❌ Ollama binary not found. Please install Ollama from https://ollama.com');
    return false;
  }

  logger.info(`🚀 Starting Ollama server from: ${binary}`);
  currentStatus = 'starting';

  try {
    ollamaProcess = spawn(binary, ['serve'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      env: { ...process.env, OLLAMA_HOST: `${OLLAMA_HOST}:${OLLAMA_PORT}` }
    });

    ollamaProcess.stdout.on('data', (data) => {
      logger.info(`[Ollama] ${data.toString().trim()}`);
    });

    ollamaProcess.stderr.on('data', (data) => {
      logger.warn(`[Ollama stderr] ${data.toString().trim()}`);
    });

    ollamaProcess.on('close', (code) => {
      logger.info(`Ollama process exited with code ${code}`);
      ollamaProcess = null;
      
      if (currentStatus !== 'stopped') {
        currentStatus = 'error';
        
        // Attempt auto-restart if unexpected exit
        if (restartAttempts < MAX_RESTART_ATTEMPTS) {
          restartAttempts++;
          const delay = restartAttempts * 2000;
          logger.warn(`⚠️ Ollama exited unexpectedly. Attempting restart ${restartAttempts}/${MAX_RESTART_ATTEMPTS} in ${delay/1000}s...`);
          setTimeout(() => startOllama(), delay);
        } else {
          logger.error('❌ Ollama reached maximum restart attempts. User intervention required.');
        }
      }
    });

    // Wait for the server to be ready (up to 15 seconds)
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (await isOllamaRunning()) {
        logger.info('✅ Ollama server is ready');
        setStatus('ready');
        return true;
      }
    }

    logger.error('⏱️ Ollama server failed to start within 15 seconds');
    setStatus('error');
    return false;
  } catch (err) {
    logger.error('❌ Failed to start Ollama:', err);
    setStatus('error');
    return false;
  }
}

/**
 * Stop the Ollama server (if we started it)
 */
function stopOllama() {
  try {
    isInitializing = false;
    if (typeof setStatus === 'function') {
      setStatus('stopped');
    } else {
      currentStatus = 'stopped';
    }
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
      healthCheckInterval = null;
    }
    if (ollamaProcess) {
      logger.info('🛑 Stopping Ollama server...');
      try {
        ollamaProcess.kill('SIGTERM');
      } catch (err) {
        logger.warn('Error stopping Ollama:', err);
      }
      ollamaProcess = null;
    }
  } catch (err) {
    // Silently handle shutdown errors to avoid user-facing error dialogs
    logger.warn('Error during Ollama shutdown:', err);
  }
}

/**
 * Check if the required model is downloaded
 */
async function isModelAvailable() {
  try {
    const res = await ollamaRequest('GET', '/api/tags');
    if (res && res.models) {
      return res.models.some(m => m.name === REQUIRED_MODEL || m.name.startsWith(REQUIRED_MODEL.split(':')[0]));
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Pull the required model with progress tracking
 * @param {Function} onProgress - Callback with { status, completed, total, percent }
 */
async function pullModel(onProgress) {
  logger.info(`📥 Pulling model: ${REQUIRED_MODEL}`);
  currentStatus = 'pulling';
  pullProgress = { status: 'starting', percent: 0 };

  try {
    const stream = await ollamaRequest('POST', '/api/pull', { name: REQUIRED_MODEL, stream: true }, true);

    return new Promise((resolve, reject) => {
      let buffer = '';

      stream.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            const progress = {
              status: data.status || 'downloading',
              completed: data.completed || 0,
              total: data.total || 0,
              percent: data.total ? Math.round((data.completed / data.total) * 100) : 0,
            };
            pullProgress = progress;
            if (onProgress) onProgress(progress);
          } catch { /* skip malformed lines */ }
        }
      });

      stream.on('end', () => {
        pullProgress = { status: 'complete', percent: 100 };
        currentStatus = 'ready';
        logger.info('✅ Model pull complete');
        if (onProgress) onProgress(pullProgress);
        resolve(true);
      });

      stream.on('error', (err) => {
        logger.error('❌ Model pull failed:', err);
        currentStatus = 'error';
        reject(err);
      });
    });
  } catch (err) {
    logger.error('❌ Model pull request failed:', err);
    currentStatus = 'error';
    throw err;
  }
}

/**
 * Send a chat message to Ollama with streaming
 * @param {Array} messages - Chat messages array [{role, content}]
 * @param {string} systemPrompt - System instruction
 * @param {Function} onToken - Callback for each streamed token
 * @returns {Promise<string>} - Full response text
 */
async function chat(messages, systemPrompt, onToken) {
  const fullMessages = [];
  
  // System prompt first
  if (systemPrompt) {
    fullMessages.push({ role: 'system', content: systemPrompt });
  }
  
  // Add conversation history
  fullMessages.push(...messages);

  const body = {
    model: REQUIRED_MODEL,
    messages: fullMessages,
    stream: true,
    options: {
      temperature: 0.4,
      num_predict: 2048,
      num_ctx: 4096,
    }
  };

  const stream = await ollamaRequest('POST', '/api/chat', body, true);
  
  return new Promise((resolve, reject) => {
    let fullResponse = '';
    let buffer = '';

    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.message && data.message.content) {
            fullResponse += data.message.content;
            if (onToken) onToken(data.message.content);
          }
          if (data.done) {
            resolve(fullResponse);
          }
        } catch { /* skip */ }
      }
    });

    stream.on('end', () => resolve(fullResponse));
    stream.on('error', reject);
  });
}

/**
 * Generate a non-streaming response (for column analysis etc.)
 */
async function generate(prompt) {
  try {
    const res = await ollamaRequest('POST', '/api/generate', {
      model: REQUIRED_MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.2, num_predict: 2048, num_ctx: 4096 }
    });
    return res.response || '';
  } catch (err) {
    logger.error('Ollama generate failed:', err);
    throw err;
  }
}

/**
 * Get current Ollama status
 */
function getStatus() {
  return {
    status: currentStatus,
    model: REQUIRED_MODEL,
    pullProgress,
    host: OLLAMA_BASE,
  };
}

/**
 * Full initialization sequence:
 * 1. Start Ollama server
 * 2. Check if model exists
 * 3. Pull model if needed
 */
async function initialize(onProgress) {
  isInitializing = true;
  try {
    const started = await startOllama();
    if (!started) {
      isInitializing = false;
      return false;
    }

    const hasModel = await isModelAvailable();
    if (!hasModel) {
      logger.info('Model not found locally, pulling...');
      await pullModel(onProgress);
    } else {
      logger.info(`✅ Model ${REQUIRED_MODEL} is already available`);
    }
  
  setStatus('ready');
  restartAttempts = 0; // Reset on successful full init

  // Start periodic health checks
  if (!healthCheckInterval) {
    healthCheckInterval = setInterval(async () => {
      if (currentStatus === 'ready' || currentStatus === 'error') {
        const running = await isOllamaRunning();
        if (!running && currentStatus === 'ready') {
          logger.warn('📡 Ollama health check failed. Process might be hung or dead.');
          setStatus('error');
          // If we have a process object but it's not responding, kill it to trigger restart
          if (ollamaProcess) {
             logger.info('Attempting to kill unresponsive Ollama process...');
             ollamaProcess.kill('SIGKILL');
          } else {
             startOllama(); // Try to start if process is gone
          }
        } else if (running && currentStatus === 'error') {
          logger.info('📡 Ollama recovered.');
          setStatus('ready');
          restartAttempts = 0;
        }
      }
    }, 30000); // Check every 30 seconds
  }

    isInitializing = false;
    return true;
  } catch (err) {
    isInitializing = false;
    logger.error('Error during Ollama initialization:', err);
    return false;
  }
}

function onStatusChange(callback) {
  statusCallback = callback;
}

module.exports = {
  initialize,
  startOllama,
  stopOllama,
  isOllamaRunning,
  isModelAvailable,
  pullModel,
  chat,
  generate,
  getStatus,
  onStatusChange,
  REQUIRED_MODEL,
};
