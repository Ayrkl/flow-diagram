const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { exec } = require('child_process');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadFile('index.html');
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

ipcMain.handle('open-directory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (canceled) return null;
  return filePaths[0];
});

ipcMain.handle('analyze-project', async (event, directoryPath) => {
  try {
    return await analyzeProject(directoryPath);
  } catch (error) {
    throw new Error(error.message || 'Analiz başarısız');
  }
});

// IPC handler to open a file in IDE (VS Code or default)
ipcMain.handle('open-file', async (event, filePath) => {
  if (!filePath) return;
  const fullPath = filePath; 
  exec(`code "${fullPath}"`, (err) => {
    if (err) {
      shell.openPath(fullPath);
    }
  });
});

// ============================================================
// DEEP PROJECT ANALYSIS ENGINE
// ============================================================

const IGNORE_LIST = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '.vscode',
  'coverage', 'obj', 'bin', '__pycache__', '.idea', 'vendor', 'out'
]);

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.vue',
  '.svelte', '.rs', '.c', '.cpp', '.cs', '.php', '.rb',
]);

async function analyzeProject(baseDir) {
  const stats = { files: 0, folders: 0, languages: {} };
  const techStack = new Set();

  // ---- 1. ROOT SIGNATURES ----
  let pkg = null;
  try {
    const rootFiles = await fs.readdir(baseDir);
    if (rootFiles.includes('package.json')) {
      pkg = JSON.parse(await fs.readFile(path.join(baseDir, 'package.json'), 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      techStack.add('JavaScript/TypeScript');
      if (allDeps.next) techStack.add('Next.js');
      if (allDeps.react) techStack.add('React');
      if (allDeps.express) techStack.add('Express');
      if (allDeps.fastify) techStack.add('Fastify');
      if (allDeps.koa) techStack.add('Koa');
      if (allDeps.nestjs || allDeps['@nestjs/core']) techStack.add('NestJS');
      if (allDeps.vue) techStack.add('Vue.js');
      if (allDeps.svelte) techStack.add('Svelte');
      if (allDeps.tailwindcss) techStack.add('TailwindCSS');
      if (allDeps.prisma || allDeps['@prisma/client']) techStack.add('Prisma ORM');
      if (allDeps.mongoose) techStack.add('MongoDB/Mongoose');
      if (allDeps.pg || allDeps.sequelize) techStack.add('PostgreSQL');
      if (allDeps.redis || allDeps.ioredis) techStack.add('Redis');
      if (allDeps.graphql || allDeps['apollo-server']) techStack.add('GraphQL');
      if (allDeps.socket || allDeps['socket.io']) techStack.add('WebSockets');
      if (allDeps.jest || allDeps.vitest) techStack.add('Testing (Jest/Vitest)');
      if (allDeps.typescript) techStack.add('TypeScript');
      if (allDeps.zod || allDeps.yup) techStack.add('Schema Validation');
      if (allDeps['next-auth'] || allDeps['@auth/core']) techStack.add('Auth (NextAuth)');
    }
    if (rootFiles.includes('go.mod')) techStack.add('Go');
    if (rootFiles.includes('requirements.txt') || rootFiles.includes('pyproject.toml')) techStack.add('Python');
    if (rootFiles.includes('pom.xml')) techStack.add('Java (Maven)');
    if (rootFiles.includes('Dockerfile') || rootFiles.includes('docker-compose.yml')) techStack.add('Docker');
    if (rootFiles.includes('.env') || rootFiles.includes('.env.local')) techStack.add('Env Config');
  } catch (e) {
    throw new Error('Dizin okunamadı: ' + e.message);
  }

  // ---- 2. DEEP SCAN ----
  const fileMap = {};
  const apiRoutes = [];
  const pageRoutes = [];
  const components = [];
  const serverModules = [];
  const dbModels = [];
  const middlewares = [];
  const configFiles = [];
  const entryPoints = [];

  async function walk(dir, depth = 0) {
    const name = path.basename(dir);
    if (IGNORE_LIST.has(name) && depth > 0) return;
    stats.folders++;
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }

    for (const entry of entries) {
      if (IGNORE_LIST.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        await walk(fullPath, depth + 1);
      } else {
        stats.files++;
        const ext = path.extname(entry.name).toLowerCase();
        if (ext) stats.languages[ext] = (stats.languages[ext] || 0) + 1;

        const lower = relPath.toLowerCase();
        let fileType = 'other';

        if (lower.includes('/api/') && (lower.endsWith('route.ts') || lower.endsWith('route.js') || lower.endsWith('index.ts') || lower.endsWith('index.js'))) {
          apiRoutes.push(relPath);
          fileType = 'api';
        }
        else if (lower.endsWith('page.tsx') || lower.endsWith('page.jsx') || lower.endsWith('page.js') || lower.endsWith('page.ts')) {
          pageRoutes.push(relPath);
          fileType = 'page';
        }
        else if (lower.includes('/components/') || lower.includes('/ui/') || lower.endsWith('.tsx') || lower.endsWith('.jsx')) {
          components.push(relPath);
          fileType = 'component';
        }
        else if (lower.includes('/actions/') || lower.includes('/services/') || lower.includes('/server/') || lower.endsWith('.server.ts')) {
          serverModules.push(relPath);
          fileType = 'server';
        }
        else if (lower.includes('/models/') || lower.includes('/schema') || lower.includes('/prisma') || entry.name === 'schema.prisma') {
          dbModels.push(relPath);
          fileType = 'model';
        }
        else if (lower.includes('middleware') && SOURCE_EXTENSIONS.has(ext)) {
          middlewares.push(relPath);
          fileType = 'middleware';
        }

        if (['main.ts','main.js','index.ts','index.js','server.ts','server.js','app.ts','app.js'].includes(entry.name) && depth <= 2) {
          entryPoints.push(relPath);
        }

        if (SOURCE_EXTENSIONS.has(ext)) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            fileMap[relPath] = { imports: [], type: fileType };
          } catch {
            fileMap[relPath] = { imports: [], type: fileType };
          }
        }
      }
    }
  }

  await walk(baseDir);

  let architecture = detectArchitecture(fileMap, techStack, { apiRoutes, pageRoutes, components, dbModels, middlewares });

  const { flowDiagram, nodePathMap } = generateDeepDiagram({
    baseDir,
    techStack: Array.from(techStack),
    apiRoutes, pageRoutes, components, serverModules,
    dbModels, middlewares, configFiles, entryPoints,
    architecture, fileMap, stats
  });

  return {
    baseDir,
    techStack: Array.from(techStack),
    architecture,
    flowDiagram,
    nodePathMap,
    stats,
    details: {
      apiRoutes: apiRoutes.map(r => r.replace(/^src\//, '')),
      pageRoutes: pageRoutes.map(r => r.replace(/^src\//, '')),
      components: components.length,
      dbModels,
      middlewares,
      entryPoints,
      fullPaths: { apiRoutes, pageRoutes, dbModels, middlewares }
    }
  };
}

function detectArchitecture(fileMap, techStack, { apiRoutes, pageRoutes, components, dbModels, middlewares }) {
  if (techStack.has('Next.js')) return 'Next.js Architecture';
  if (techStack.has('NestJS')) return 'NestJS Module Architecture';
  if (techStack.has('Express')) return 'Express MVC Architecture';
  return 'Standard Modular Architecture';
}

function sanitizeLabel(str) {
  return str.replace(/"/g, "'").replace(/[<>{}[\]]/g, '').replace(/\\/g, '/').trim();
}

function toRouteLabel(filePath, stripFile) {
  let p = filePath.replace(/\\/g, '/');
  p = p.replace(/^src\//, '').replace(/^app\//, '').replace(/^pages\//, '');
  if (stripFile) p = p.replace(/\/(page|route|index)\.(tsx?|jsx?)$/, '').replace(/\.(tsx?|jsx?)$/, '');
  p = p.replace(/\([^)]+\)\//g, '').replace(/\([^)]+\)$/g, '');
  p = p.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
  return p || '/';
}

// RESTORED: Categorical "Architecture Layer" diagram engine
function generateDeepDiagram({ baseDir, techStack, apiRoutes, pageRoutes, components, serverModules,
  dbModels, middlewares, configFiles, entryPoints, architecture, fileMap, stats }) {

  const lines = ['flowchart LR'];
  const nodePathMap = {};

  // Styles
  lines.push('  classDef page fill:#0d2a1a,stroke:#00ff88,color:#ccffd6,stroke-width:1.5px');
  lines.push('  classDef api fill:#0d1f2e,stroke:#00d4ff,color:#c4eeff,stroke-width:1.5px');
  lines.push('  classDef db fill:#1e0d2e,stroke:#a855f7,color:#e2c6ff,stroke-width:1.5px');
  lines.push('  classDef mw fill:#2e0d0d,stroke:#f97316,color:#ffe0c4,stroke-width:1.5px');
  lines.push('  classDef server fill:#0d1e1e,stroke:#34d399,color:#b5f5e0,stroke-width:1.5px');
  lines.push('  classDef entry fill:#050510,stroke:#00ff88,color:#00ff88,stroke-width:2.5px');

  // --- Subgraph: Request ---
  lines.push('');
  lines.push('  subgraph REQUEST["⬇️ Giriş"]');
  lines.push('    CLIENT(["👤 Tarayıcı"])');
  if (middlewares.length > 0) {
    lines.push('    MW_CHAIN["⚙️ Middleware"]');
    lines.push('    CLIENT --> MW_CHAIN');
    nodePathMap['MW_CHAIN'] = path.join(baseDir, middlewares[0]);
  }
  lines.push('  end');

  // --- Subgraph: Pages ---
  if (pageRoutes.length > 0) {
    lines.push('');
    lines.push('  subgraph PAGES["📄 Sayfalar"]');
    pageRoutes.slice(0, 7).forEach((p, i) => {
      const id = 'P' + i;
      lines.push(`    ${id}["📄 /${sanitizeLabel(toRouteLabel(p, true))}"]`);
      nodePathMap[id] = path.join(baseDir, p);
    });
    lines.push('  end');
  }

  // --- Subgraph: API ---
  if (apiRoutes.length > 0) {
    lines.push('');
    lines.push('  subgraph APILAYER["🔌 API Rotaları"]');
    apiRoutes.slice(0, 8).forEach((r, i) => {
      const id = 'A' + i;
      lines.push(`    ${id}["🔌 /api/${sanitizeLabel(toRouteLabel(r, true).replace(/^api\/?/, ''))}"]`);
      nodePathMap[id] = path.join(baseDir, r);
    });
    lines.push('  end');
  }

  // --- Subgraph: Services ---
  if (serverModules.length > 0) {
    lines.push('');
    lines.push('  subgraph SERVICES["⚙️ Servisler"]');
    serverModules.slice(0, 6).forEach((s, i) => {
      const id = 'SVC' + i;
      lines.push(`    ${id}["⚙️ ${sanitizeLabel(path.basename(s, path.extname(s)))}"]`);
      nodePathMap[id] = path.join(baseDir, s);
    });
    lines.push('  end');
  }

  // --- Subgraph: Data ---
  const hasDB = dbModels.length > 0 || techStack.some(t => t.includes('Prisma') || t.includes('SQL') || t.includes('Mongo'));
  if (hasDB) {
    lines.push('');
    lines.push('  subgraph DBLAYER["🗄️ Veri Katmanı"]');
    if (techStack.includes('Prisma ORM')) lines.push('    PRISMA[("🔷 Prisma Client")]');
    if (dbModels.length > 0) {
      dbModels.slice(0, 3).forEach((m, i) => {
        const id = 'SCHEMA' + i;
        lines.push(`    ${id}["📋 ${sanitizeLabel(path.basename(m, path.extname(m)))}"]`);
        nodePathMap[id] = path.join(baseDir, m);
      });
    }
    lines.push('  end');
  }

  // Connections
  lines.push('');
  const entry = middlewares.length > 0 ? 'MW_CHAIN' : 'CLIENT';
  if (pageRoutes.length > 0) lines.push(`  ${entry} --> P0`);
  if (apiRoutes.length > 0) lines.push(`  ${entry} --> A0`);
  if (pageRoutes.length > 0 && apiRoutes.length > 0) lines.push('  P0 -.-> A0');
  if (apiRoutes.length > 0 && serverModules.length > 0) lines.push('  A0 --> SVC0');
  if (serverModules.length > 0 && hasDB) lines.push('  SVC0 --> ' + (techStack.includes('Prisma ORM') ? 'PRISMA' : 'SCHEMA0'));

  // Classes
  lines.push('  class CLIENT entry');
  if (middlewares.length > 0) lines.push('  class MW_CHAIN mw');
  pageRoutes.slice(0, 7).forEach((_, i) => lines.push(`  class P${i} page`));
  apiRoutes.slice(0, 8).forEach((_, i) => lines.push(`  class A${i} api`));
  serverModules.slice(0, 6).forEach((_, i) => lines.push(`  class SVC${i} server`));
  if (hasDB) {
    if (techStack.includes('Prisma ORM')) lines.push('  class PRISMA db');
    dbModels.slice(0, 3).forEach((_, i) => lines.push(`  class SCHEMA${i} db`));
  }

  return { flowDiagram: lines.join('\n'), nodePathMap };
}
