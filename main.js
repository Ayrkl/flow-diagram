const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

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

  // ---- 2. DEEP SCAN: Collect files and read import graphs ----
  const fileMap = {};       // relative path -> { imports: [], exports: [], type }
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

        // Categorize file
        const lower = relPath.toLowerCase();
        let fileType = 'other';

        // API Routes
        if (lower.includes('/api/') && (lower.endsWith('route.ts') || lower.endsWith('route.js') || lower.endsWith('index.ts') || lower.endsWith('index.js'))) {
          apiRoutes.push(relPath);
          fileType = 'api';
        }
        // Page routes
        else if (lower.endsWith('page.tsx') || lower.endsWith('page.jsx') || lower.endsWith('page.js') || lower.endsWith('page.ts')) {
          pageRoutes.push(relPath);
          fileType = 'page';
        }
        // Layout files
        else if (entry.name.toLowerCase().startsWith('layout.')) {
          fileType = 'layout';
        }
        // Components
        else if (lower.includes('/components/') || lower.includes('/ui/') || lower.endsWith('.tsx') || lower.endsWith('.jsx')) {
          components.push(relPath);
          fileType = 'component';
        }
        // Server / actions / services
        else if (lower.includes('/actions/') || lower.includes('/services/') || lower.includes('/server/') || lower.endsWith('.server.ts')) {
          serverModules.push(relPath);
          fileType = 'server';
        }
        // DB / Models
        else if (lower.includes('/models/') || lower.includes('/schema') || lower.includes('/prisma') || entry.name === 'schema.prisma') {
          dbModels.push(relPath);
          fileType = 'model';
        }
        // Middleware
        else if (lower.includes('middleware') && SOURCE_EXTENSIONS.has(ext)) {
          middlewares.push(relPath);
          fileType = 'middleware';
        }
        // Config
        else if (entry.name.match(/\.(config|env|json|yaml|yml|toml)$/i) && !entry.name.startsWith('.')) {
          configFiles.push(relPath);
          fileType = 'config';
        }

        // Entry points
        if (['main.ts','main.js','index.ts','index.js','server.ts','server.js','app.ts','app.js'].includes(entry.name) && depth <= 2) {
          entryPoints.push(relPath);
        }

        if (SOURCE_EXTENSIONS.has(ext)) {
          // Read imports
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const imports = extractImports(content);
            fileMap[relPath] = { imports, type: fileType };
          } catch {
            fileMap[relPath] = { imports: [], type: fileType };
          }
        }
      }
    }
  }

  await walk(baseDir);

  // ---- 3. ARCHITECTURE DETECTION ----
  let architecture = detectArchitecture(fileMap, techStack, { apiRoutes, pageRoutes, components, dbModels, middlewares });

  // ---- 4. GENERATE DEEP MERMAID DIAGRAM ----
  const flowDiagram = generateDeepDiagram({
    techStack: Array.from(techStack),
    apiRoutes, pageRoutes, components, serverModules,
    dbModels, middlewares, configFiles, entryPoints,
    architecture, fileMap, stats
  });

  return {
    techStack: Array.from(techStack),
    architecture,
    flowDiagram,
    stats,
    details: {
      apiRoutes: apiRoutes.map(r => r.replace(/^src\//, '')),
      pageRoutes: pageRoutes.map(r => r.replace(/^src\//, '')),
      components: components.length,
      dbModels,
      middlewares,
      entryPoints
    }
  };
}

// ---- Extract import paths from source file content ----
function extractImports(content) {
  const imports = [];
  const patterns = [
    /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
    /require\(['"]([^'"]+)['"]\)/g,
    /import\(['"]([^'"]+)['"]\)/g,
  ];
  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(content)) !== null) {
      imports.push(m[1]);
    }
  }
  return imports;
}

// ---- Architecture detection heuristic ----
function detectArchitecture(fileMap, techStack, { apiRoutes, pageRoutes, components, dbModels, middlewares }) {
  if (techStack.has('Next.js')) {
    const hasAppDir = Object.keys(fileMap).some(f => f.startsWith('src/app/') || f.startsWith('app/'));
    const hasPagesDir = Object.keys(fileMap).some(f => f.startsWith('src/pages/') || f.startsWith('pages/'));
    if (hasAppDir) return 'Next.js App Router Architecture';
    if (hasPagesDir) return 'Next.js Pages Router Architecture';
    return 'Next.js Architecture';
  }
  if (techStack.has('NestJS')) return 'NestJS Module Architecture';
  if (techStack.has('Express')) return 'Express MVC Architecture';
  if (techStack.has('Fastify')) return 'Fastify Plugin Architecture';
  if (techStack.has('Go')) return 'Go Service Architecture';
  if (techStack.has('Python')) return 'Python Application Architecture';
  if (techStack.has('Vue.js')) return 'Vue.js SPA Architecture';
  if (dbModels.length > 0 && apiRoutes.length > 0) return 'API + Data Model Architecture';
  return 'Standard Modular Architecture';
}

// ---- Generate detailed, project-specific Mermaid flowchart ----
function generateDeepDiagram({ techStack, apiRoutes, pageRoutes, components, serverModules,
  dbModels, middlewares, configFiles, entryPoints, architecture, fileMap, stats }) {

  const lines = ['flowchart TD'];

  // Styling
  lines.push('  classDef page fill:#1a3a2a,stroke:#00ff88,color:#fff');
  lines.push('  classDef api fill:#1a2a3a,stroke:#00d4ff,color:#fff');
  lines.push('  classDef db fill:#2a1a3a,stroke:#a855f7,color:#fff');
  lines.push('  classDef comp fill:#2a2a1a,stroke:#facc15,color:#fff');
  lines.push('  classDef mw fill:#3a1a1a,stroke:#f97316,color:#fff');
  lines.push('  classDef entry fill:#0a0a0a,stroke:#00ff88,color:#00ff88,stroke-width:2px');
  lines.push('  classDef config fill:#1a1a1a,stroke:#666,color:#aaa');
  lines.push('  classDef server fill:#1a2a2a,stroke:#34d399,color:#fff');

  const hasTechNextjs = techStack.includes('Next.js');
  const hasTechExpress = techStack.includes('Express') || techStack.includes('Fastify') || techStack.includes('NestJS');

  // ---- Subgraph: Request Entry ----
  lines.push('');
  lines.push('  subgraph REQUEST["🌐 İstek Giriş Noktası"]');
  lines.push('    CLIENT(["👤 Kullanıcı / İstemci"])');
  if (middlewares.length > 0) {
    lines.push(`    MW_CHAIN["⚙️ Middleware Zinciri\\n${middlewares.slice(0, 2).map(m => path.basename(m)).join(' → ')}"]`);
  }
  lines.push('  end');

  // ---- Subgraph: Pages / Router ----
  if (pageRoutes.length > 0) {
    lines.push('');
    lines.push('  subgraph PAGES["📄 Sayfa Katmanı (Pages / App Router)"]');
    const shown = pageRoutes.slice(0, 6);
    shown.forEach((p, i) => {
      const label = p.replace(/src\/app\/|src\/pages\//,'').replace('/page.tsx','').replace('/page.jsx','') || '/';
      const safeId = 'P' + i;
      lines.push(`    ${safeId}["📄 /${label}"]`);
    });
    if (pageRoutes.length > 6) {
      lines.push(`    PMORE["+ ${pageRoutes.length - 6} sayfa daha..."]`);
    }
    lines.push('  end');
  }

  // ---- Subgraph: API Layer ----
  if (apiRoutes.length > 0) {
    lines.push('');
    lines.push('  subgraph APILAYER["🔌 API Katmanı (Route Handlers)"]');
    const shownApi = apiRoutes.slice(0, 8);
    shownApi.forEach((r, i) => {
      const label = r.replace(/src\/app\//,'').replace('/route.ts','').replace('/route.js','').replace('api/','');
      const safeId = 'A' + i;
      const method = r.endsWith('.ts') ? 'GET/POST' : 'HANDLER';
      lines.push(`    ${safeId}["🔌 /api/${label}\\n[${method}]"]`);
    });
    if (apiRoutes.length > 8) lines.push(`    AMORE["+ ${apiRoutes.length-8} route daha..."]`);
    lines.push('  end');
  }

  // ---- Subgraph: Server Actions / Services ----
  if (serverModules.length > 0) {
    lines.push('');
    lines.push('  subgraph SERVICES["⚙️ Server Katmanı (Actions / Services)"]');
    serverModules.slice(0, 5).forEach((s, i) => {
      const label = path.basename(s, path.extname(s));
      lines.push(`    SVC${i}["⚙️ ${label}"]`);
    });
    lines.push('  end');
  }

  // ---- Subgraph: DB Layer ----
  const hasDB = dbModels.length > 0 || techStack.some(t => t.includes('ORM') || t.includes('SQL') || t.includes('Mongo') || t.includes('Redis'));
  if (hasDB) {
    lines.push('');
    lines.push('  subgraph DBLAYER["🗄️ Veri Katmanı"]');
    if (dbModels.length > 0) {
      dbModels.slice(0, 4).forEach((m, i) => {
        const label = path.basename(m, path.extname(m));
        lines.push(`    DB${i}["📦 ${label}"]`);
      });
    }
    if (techStack.includes('Prisma ORM')) lines.push('    PRISMA[("🔷 Prisma Client")]');
    if (techStack.includes('MongoDB/Mongoose')) lines.push('    MONGO[("🍃 MongoDB")]');
    if (techStack.includes('PostgreSQL')) lines.push('    PG[("🐘 PostgreSQL")]');
    if (techStack.includes('Redis')) lines.push('    REDIS[("⚡ Redis Cache")]');
    lines.push('  end');
  }

  // ---- Subgraph: External ----
  const hasExternal = techStack.some(t => ['WebSockets','Auth (NextAuth)','GraphQL'].includes(t));
  if (hasExternal) {
    lines.push('');
    lines.push('  subgraph EXTERNAL["🌍 Harici Servisler"]');
    if (techStack.includes('Auth (NextAuth)')) lines.push('    AUTH["🔐 Auth Provider\\n(NextAuth / OAuth)"]');
    if (techStack.includes('WebSockets')) lines.push('    WS["📡 WebSocket Server"]');
    if (techStack.includes('GraphQL')) lines.push('    GQL["🔺 GraphQL Layer"]');
    lines.push('  end');
  }

  // ---- Connections ----
  lines.push('');

  // CLIENT -> Middleware -> Pages
  if (middlewares.length > 0) {
    lines.push('  CLIENT -->|HTTP Request| MW_CHAIN');
    if (pageRoutes.length > 0) lines.push('  MW_CHAIN -->|Geçti| P0');
    if (apiRoutes.length > 0) lines.push('  MW_CHAIN -->|API İsteği| A0');
  } else {
    if (pageRoutes.length > 0) lines.push('  CLIENT -->|Sayfa Navigasyonu| P0');
    if (apiRoutes.length > 0) lines.push('  CLIENT -->|fetch / axios| A0');
  }

  // Pages -> API
  if (pageRoutes.length > 0 && apiRoutes.length > 0) {
    lines.push('  P0 -->|Server Action / fetch| A0');
  }

  // Pages / API -> Services
  if (serverModules.length > 0) {
    if (apiRoutes.length > 0) lines.push('  A0 -->|Çağrı| SVC0');
    else if (pageRoutes.length > 0) lines.push('  P0 -->|Server Action| SVC0');
  }

  // Services -> DB
  if (hasDB) {
    const srcId = serverModules.length > 0 ? 'SVC0' : apiRoutes.length > 0 ? 'A0' : 'P0';
    if (techStack.includes('Prisma ORM')) {
      lines.push(`  ${srcId} -->|Sorgu| PRISMA`);
      if (techStack.includes('PostgreSQL')) lines.push('  PRISMA -->|SQL| PG');
      else if (techStack.includes('MongoDB/Mongoose')) lines.push('  PRISMA -->|Document| MONGO');
    } else if (techStack.includes('MongoDB/Mongoose')) {
      lines.push(`  ${srcId} -->|Mongoose Query| MONGO`);
    } else if (techStack.includes('PostgreSQL')) {
      lines.push(`  ${srcId} -->|SQL Query| PG`);
    }
    if (techStack.includes('Redis')) {
      lines.push(`  ${srcId} -.->|Cache Kontrol| REDIS`);
    }
    if (dbModels.length > 0) {
      lines.push(`  DB0 -->|Schema| DB0`);
    }
  }

  // Auth flow
  if (techStack.includes('Auth (NextAuth)')) {
    if (middlewares.length > 0) lines.push('  MW_CHAIN -->|Auth Check| AUTH');
    else if (pageRoutes.length > 0) lines.push('  P0 -.->|Session Check| AUTH');
  }

  // WebSocket
  if (techStack.includes('WebSockets')) {
    lines.push('  CLIENT <-->|ws://| WS');
  }

  // API -> GraphQL
  if (techStack.includes('GraphQL')) {
    lines.push('  A0 -->|Resolver| GQL');
  }

  // Apply classes
  if (middlewares.length > 0) lines.push('  class MW_CHAIN mw');
  if (pageRoutes.length > 0) {
    pageRoutes.slice(0, 6).forEach((_, i) => lines.push(`  class P${i} page`));
  }
  if (apiRoutes.length > 0) {
    apiRoutes.slice(0, 8).forEach((_, i) => lines.push(`  class A${i} api`));
  }
  if (serverModules.length > 0) {
    serverModules.slice(0, 5).forEach((_, i) => lines.push(`  class SVC${i} server`));
  }
  if (dbModels.length > 0) {
    dbModels.slice(0, 4).forEach((_, i) => lines.push(`  class DB${i} db`));
  }
  lines.push('  class CLIENT entry');

  return lines.join('\n');
}
