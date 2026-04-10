const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: 'hiddenInset',
  });

  win.loadFile('index.html');
  // win.webContents.openDevTools(); // Development only
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('open-directory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  if (canceled) return null;
  return filePaths[0];
});

ipcMain.handle('analyze-project', async (event, directoryPath) => {
  try {
    return await analyzeProject(directoryPath);
  } catch (error) {
    console.error('Analysis error:', error);
    throw error;
  }
});

// --- Ported Analysis Logic ---
const IGNORE_LIST = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.vscode', 'coverage', 'obj', 'bin']);

async function analyzeProject(directoryPath) {
  const stats = {
    files: 0,
    folders: 0,
    languages: {},
  };

  const techStack = new Set();
  
  // 1. Scan for Tech Signatures
  const rootFiles = await fs.readdir(directoryPath);
  
  if (rootFiles.includes('package.json')) {
    const pkgContent = await fs.readFile(path.join(directoryPath, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgContent);
    techStack.add('JavaScript/TypeScript');
    if (pkg.dependencies?.next) techStack.add('Next.js');
    if (pkg.dependencies?.react) techStack.add('React');
    if (pkg.dependencies?.express) techStack.add('Express');
    if (pkg.dependencies?.tailwindcss) techStack.add('TailwindCSS');
    if (pkg.devDependencies?.typescript) techStack.add('TypeScript');
  }
  
  if (rootFiles.includes('go.mod')) techStack.add('Go');
  if (rootFiles.includes('requirements.txt')) techStack.add('Python');
  if (rootFiles.includes('pom.xml')) techStack.add('Java');
  if (rootFiles.includes('Dockerfile')) techStack.add('Docker');

  // 2. Recursive File Walker
  async function walk(dir, depth = 0) {
    const name = path.basename(dir);
    if (IGNORE_LIST.has(name) && depth > 0) return null;

    stats.folders++;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const children = [];

    for (const entry of entries) {
      if (IGNORE_LIST.has(entry.name)) continue;

      if (entry.isDirectory()) {
        const child = await walk(path.join(dir, entry.name), depth + 1);
        if (child) children.push(child);
      } else {
        stats.files++;
        const ext = path.extname(entry.name).toLowerCase();
        if (ext) {
          stats.languages[ext] = (stats.languages[ext] || 0) + 1;
        }
        children.push({ name: entry.name, type: 'file' });
      }
    }

    return { name, type: 'directory', children };
  }

  const fileTree = await walk(directoryPath);

  // 3. Simple Architecture Detection
  let architecture = 'Standard Structure';
  const hasSrc = fileTree.children?.some(c => c.name === 'src' && c.type === 'directory');
  if (hasSrc) architecture = 'SRC-based Structure';
  if (techStack.has('Next.js')) architecture = 'Next.js App Router Architecture';

  // 4. Generate Mermaid Diagrams
  const flowDiagram = 'graph TD\n' +
    '  Start((User Request)) --> Entry[Entry Point]\n' +
    (techStack.has('Next.js') ? 
      '  Entry --> Routes[App Router]\n  Routes --> ServerComponents[Server Components]\n  ServerComponents --> API[API Routes]' : 
      '  Entry --> Modules[Project Modules]');

  return {
    techStack: Array.from(techStack),
    fileTree,
    architecture,
    flowDiagram,
    stats
  };
}
