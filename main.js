const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'storage.json');
let appServer;
let mainWindow;

function ensureStorageFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '{}', 'utf8');
    return;
  }

  try {
    JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (error) {
    fs.writeFileSync(DATA_FILE, '{}', 'utf8');
  }
}

function readStorageMap() {
  ensureStorageFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (error) {
    return {};
  }
}

function writeStorageMap(map) {
  ensureStorageFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(map, null, 2), 'utf8');
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const requestPath = req.url === '/' ? '/index.htm' : req.url.split('?')[0];
      const filePath = path.normalize(path.join(__dirname, requestPath));

      if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.readFile(filePath, (error, data) => {
        if (error) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const extension = path.extname(filePath).toLowerCase();
        const contentTypes = {
          '.html': 'text/html; charset=utf-8',
          '.htm': 'text/html; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.svg': 'image/svg+xml',
          '.json': 'application/json; charset=utf-8',
          '.ico': 'image/x-icon'
        };

        res.writeHead(200, { 'Content-Type': contentTypes[extension] || 'application/octet-stream' });
        res.end(data);
      });
    });

    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function getDbValue(key) {
  const map = readStorageMap();
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
}

function setDbValue(key, value) {
  const map = readStorageMap();
  map[key] = String(value);
  writeStorageMap(map);
  return String(value);
}

function removeDbValue(key) {
  const map = readStorageMap();
  delete map[key];
  writeStorageMap(map);
}

ipcMain.on('storage:getItem', (event, key) => {
  event.returnValue = getDbValue(key);
});

ipcMain.on('storage:setItem', (event, key, value) => {
  event.returnValue = setDbValue(key, value);
});

ipcMain.on('storage:removeItem', (event, key) => {
  removeDbValue(key);
  event.returnValue = null;
});

ipcMain.on('storage:clear', (event) => {
  writeStorageMap({});
  event.returnValue = true;
});

ipcMain.on('getAppDataPath', (event) => {
  event.returnValue = DATA_DIR;
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 1000,
    minWidth: 1100,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const port = appServer.address().port;
  mainWindow.loadURL(`http://127.0.0.1:${port}/index.htm`);

  if (process.argv.includes('--devtools')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(async () => {
  ensureStorageFile();
  appServer = await startStaticServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  if (appServer) {
    appServer.close();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
