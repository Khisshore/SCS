/**
 * GOOGLE DRIVE MODULE — Electron Main Process
 * Handles OAuth2 authentication and Google Drive API operations.
 * Uses raw fetch() against googleapis.com REST endpoints (no npm deps).
 */

const { BrowserWindow } = require('electron');
const logger = require('./logger');

// OAuth2 Configuration — loaded from environment for desktop app
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost';
const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',     // Only files created by this app
  'https://www.googleapis.com/auth/userinfo.email'   // Get user email for display
].join(' ');

const MASTER_FOLDER_NAME = 'SCS_Master_Sync';

let accessToken = null;
let tokenExpiry = 0;

// ==================== OAuth2 Flow ====================

/**
 * Start the OAuth2 authorization flow in a popup window.
 * Returns { accessToken, refreshToken, email } on success.
 */
function startAuthFlow() {
  return new Promise((resolve, reject) => {
    let settled = false;  // Guard against double resolve/reject from race conditions

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(SCOPES)}` +
      `&access_type=offline` +
      `&prompt=consent`;

    const authWindow = new BrowserWindow({
      width: 520,
      height: 800,
      show: true,
      autoHideMenuBar: true,
      title: 'Sign in with Google',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    authWindow.loadURL(authUrl);

    // Listen for redirect to localhost with auth code
    authWindow.webContents.on('will-redirect', async (event, url) => {
      await handleRedirect(url, authWindow, (val) => {
        if (settled) return;
        settled = true;
        resolve(val);
      }, (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      });
    });

    authWindow.webContents.on('will-navigate', async (event, url) => {
      await handleRedirect(url, authWindow, (val) => {
        if (settled) return;
        settled = true;
        resolve(val);
      }, (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      });
    });

    authWindow.on('closed', () => {
      if (settled) return;  // Auth already resolved successfully — ignore this close
      settled = true;
      reject(new Error('Auth window was closed by user'));
    });
  });
}

async function handleRedirect(url, authWindow, resolve, reject) {
  if (!url.startsWith(REDIRECT_URI)) return;

  try {
    const urlObj = new URL(url);
    const code = urlObj.searchParams.get('code');
    const error = urlObj.searchParams.get('error');

    if (error) {
      authWindow.destroy();
      reject(new Error(`Google auth error: ${error}`));
      return;
    }

    if (!code) return;

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      authWindow.destroy();
      reject(new Error(`Token exchange error: ${tokens.error_description || tokens.error}`));
      return;
    }

    accessToken = tokens.access_token;
    tokenExpiry = Date.now() + (tokens.expires_in * 1000);

    // Get user email
    const userInfo = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const user = await userInfo.json();

    logger.info(`✅ Google Drive authenticated as: ${user.email}`);

    // Resolve BEFORE destroying so the closed handler (if it fires) sees settled=true
    resolve({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      email: user.email
    });

    // Destroy after resolve — this fires 'closed' but the settled guard blocks reject
    authWindow.destroy();
  } catch (err) {
    authWindow.destroy();
    reject(err);
  }
}

// ==================== Token Management ====================

/**
 * Refresh the access token using a stored refresh token.
 */
async function refreshAccessToken(refreshToken) {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'refresh_token'
      })
    });

    const data = await response.json();

    if (data.error) {
      logger.error('Token refresh failed:', data.error);
      throw new Error(data.error_description || data.error);
    }

    accessToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000);
    logger.info('🔄 Google Drive access token refreshed');

    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in
    };
  } catch (err) {
    logger.error('Failed to refresh Google token:', err);
    throw err;
  }
}

/**
 * Ensure we have a valid access token, refreshing if needed.
 */
async function ensureToken(refreshToken) {
  if (accessToken && Date.now() < tokenExpiry - 60000) {
    return accessToken; // Still valid (with 60s buffer)
  }
  const result = await refreshAccessToken(refreshToken);
  return result.accessToken;
}

// ==================== Drive API Operations ====================

/**
 * Find or create the master sync folder in Google Drive root.
 * Returns the folder ID.
 */
async function findOrCreateMasterFolder(refreshToken) {
  const token = await ensureToken(refreshToken);

  // Search for existing folder
  const query = `name='${MASTER_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const searchData = await searchRes.json();

  if (searchData.files && searchData.files.length > 0) {
    logger.info(`📁 Found existing master folder: ${searchData.files[0].id}`);
    return searchData.files[0].id;
  }

  // Create new folder
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: MASTER_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });
  const folder = await createRes.json();
  logger.info(`📁 Created master folder: ${folder.id}`);
  return folder.id;
}

/**
 * Upload a JSON file to a specific folder on Google Drive.
 * If a file with the same name exists, update it. Otherwise, create new.
 */
async function uploadFile(refreshToken, fileName, jsonContent, folderId) {
  const token = await ensureToken(refreshToken);

  // Check if file already exists
  const query = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const searchData = await searchRes.json();

  const content = typeof jsonContent === 'string' ? jsonContent : JSON.stringify(jsonContent);

  if (searchData.files && searchData.files.length > 0) {
    // Update existing file
    const fileId = searchData.files[0].id;
    const updateRes = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: content
      }
    );
    const updated = await updateRes.json();
    return { id: updated.id, action: 'updated' };
  } else {
    // Create new file with multipart upload
    const metadata = {
      name: fileName,
      parents: [folderId],
      mimeType: 'application/json'
    };

    const boundary = '-------scs_boundary';
    const body = 
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      `${content}\r\n` +
      `--${boundary}--`;

    const createRes = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body
      }
    );
    const created = await createRes.json();
    return { id: created.id, action: 'created' };
  }
}

/**
 * Download a file's content from Google Drive by file ID.
 */
async function downloadFile(refreshToken, fileId) {
  const token = await ensureToken(refreshToken);

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }

  return await res.text();
}

/**
 * List files in a specific folder on Google Drive.
 */
async function listFiles(refreshToken, folderId) {
  const token = await ensureToken(refreshToken);

  const query = `'${folderId}' in parents and trashed=false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime,size)&orderBy=modifiedTime desc`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  return data.files || [];
}

/**
 * Delete a file from Google Drive by ID.
 */
async function deleteFile(refreshToken, fileId) {
  const token = await ensureToken(refreshToken);

  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
}

/**
 * Revoke the refresh token (for disconnect).
 */
async function revokeToken(token) {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    accessToken = null;
    tokenExpiry = 0;
    logger.info('🔓 Google Drive token revoked');
  } catch (err) {
    logger.warn('Token revoke failed (non-critical):', err.message);
  }
}

module.exports = {
  startAuthFlow,
  refreshAccessToken,
  findOrCreateMasterFolder,
  uploadFile,
  downloadFile,
  listFiles,
  deleteFile,
  revokeToken
};
