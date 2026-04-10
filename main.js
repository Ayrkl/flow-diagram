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

// ---- Sanitize a string for use inside Mermaid node labels ----
function sanitizeLabel(str) {
  return str
    .replace(/"/g, "'")
    .replace(/[<>{}[\]]/g, '')
    .replace(/\\/g, '/')
    .trim();
}

// ---- Convert a file path to a clean URL-like route label ----
function toRouteLabel(filePath, stripFile) {
  let p = filePath.replace(/\\/g, '/');
  // Remove common prefixes
  p = p.replace(/^src\//, '').replace(/^app\//, '').replace(/^pages\//, '');
  // Remove the file itself
  if (stripFile) p = p.replace(/\/(page|route|index)\.(tsx?|jsx?)$/, '').replace(/\.(tsx?|jsx?)$/, '');
  // Remove route groups in parens
  p = p.replace(/\([^)]+\)\//g, '').replace(/\([^)]+\)$/g, '');
  // Remaining: clean path
  p = p.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
  return p || '/';
}

// ---- Generate detailed, project-specific Mermaid flowchart ----
function generateDeepDiagram({ techStack, apiRoutes, pageRoutes, components, serverModules,
  dbModels, middlewares, configFiles, entryPoints, architecture, fileMap, stats }) {

  const lines = ['flowchart TD'];

  // --- Styles ---
  lines.push('  classDef page fill:#0d2a1a,stroke:#00ff88,color:#ccffd6,stroke-width:1.5px');
  lines.push('  classDef api fill:#0d1f2e,stroke:#00d4ff,color:#c4eeff,stroke-width:1.5px');
  lines.push('  classDef db fill:#1e0d2e,stroke:#a855f7,color:#e2c6ff,stroke-width:1.5px');
  lines.push('  classDef comp fill:#211e00,stroke:#facc15,color:#fff8b3,stroke-width:1px');
  lines.push('  classDef mw fill:#2e0d0d,stroke:#f97316,color:#ffe0c4,stroke-width:1.5px');
  lines.push('  classDef server fill:#0d1e1e,stroke:#34d399,color:#b5f5e0,stroke-width:1.5px');
  lines.push('  classDef entry fill:#050510,stroke:#00ff88,color:#00ff88,stroke-width:2.5px');
  lines.push('  classDef ext fill:#1a1a0d,stroke:#fde68a,color:#fef3c7,stroke-width:1px');
  lines.push('  classDef more fill:#151515,stroke:#444,color:#888,stroke-width:1px');

  // =============================
  // 1. ENTRY / REQUEST SUBGRAPH
  // =============================
  lines.push('');
  lines.push('  subgraph REQUEST["⬇️  Giriş — Kullanıcı İsteği"]');
  lines.push('    direction TB');
  lines.push('    CLIENT(["👤 Tarayıcı / İstemci\\nHTTP Talebi Oluştur"])');

  if (middlewares.length > 0) {
    const mwNames = middlewares.slice(0, 3).map(m => path.basename(m, path.extname(m))).join('  →  ');
    lines.push(`    MW_CHAIN["⚙️ Middleware Zinciri\\n${sanitizeLabel(mwNames)}\\n(Auth · CORS · Rate Limit · Log)"]`);
    lines.push('    CLIENT -->|"1. HTTP İsteği"| MW_CHAIN');
  }
  lines.push('  end');

  // =============================
  // 2. ROUTING / PAGE LAYER
  // =============================
  if (pageRoutes.length > 0) {
    lines.push('');
    lines.push('  subgraph PAGES["📄  Sayfa Katmanı — App Router"]');
    lines.push('    direction TB');

    const MAX_SHOWN = Math.min(pageRoutes.length, 7);
    pageRoutes.slice(0, MAX_SHOWN).forEach((p, i) => {
      const routeLabel = toRouteLabel(p, true);
      const fileName = path.basename(p);
      const id = 'P' + i;
      lines.push(`    ${id}["📄 /${sanitizeLabel(routeLabel)}\\nServer Component\\n${fileName}"]`);
    });
    if (pageRoutes.length > MAX_SHOWN) {
      lines.push(`    PMORE["+ ${pageRoutes.length - MAX_SHOWN} sayfa daha"]`);
    }
    lines.push('  end');
  }

  // =============================
  // 3. API LAYER
  // =============================
  if (apiRoutes.length > 0) {
    lines.push('');
    lines.push('  subgraph APILAYER["🔌  API Katmanı — Route Handlers"]');
    lines.push('    direction TB');

    const MAX_API = Math.min(apiRoutes.length, 8);
    apiRoutes.slice(0, MAX_API).forEach((r, i) => {
      const routeLabel = toRouteLabel(r, true).replace(/^api\/?/, '');
      const fileName = path.basename(r);
      const id = 'A' + i;
      // Try to detect HTTP method from filename or path hints
      const isPost = r.includes('create') || r.includes('register') || r.includes('login') || r.includes('submit');
      const method = isPost ? 'POST · PUT' : 'GET · POST · DELETE';
      lines.push(`    ${id}["🔌 /api/${sanitizeLabel(routeLabel)}\\n[${method}]\\n${fileName}"]`);
    });
    if (apiRoutes.length > MAX_API) {
      lines.push(`    AMORE["+ ${apiRoutes.length - MAX_API} route daha"]`);
    }
    lines.push('  end');
  }

  // =============================
  // 4. SERVICE / ACTION LAYER
  // =============================
  if (serverModules.length > 0) {
    lines.push('');
    lines.push('  subgraph SERVICES["⚙️  Servis Katmanı — Business Logic"]');
    lines.push('    direction TB');

    const MAX_SVC = Math.min(serverModules.length, 6);
    serverModules.slice(0, MAX_SVC).forEach((s, i) => {
      const name = path.basename(s, path.extname(s));
      const type = s.includes('actions') ? 'Server Action' : s.includes('services') ? 'Service' : 'Module';
      lines.push(`    SVC${i}["⚙️ ${sanitizeLabel(name)}\\n[${type}]\\nİş Mantığı · Validasyon"]`);
    });
    if (serverModules.length > MAX_SVC) {
      lines.push(`    SVCMORE["+ ${serverModules.length - MAX_SVC} modül daha"]`);
    }
    lines.push('  end');
  }

  // =============================
  // 5. DATA LAYER
  // =============================
  const hasDB = dbModels.length > 0 || techStack.some(t =>
    t.includes('Prisma') || t.includes('SQL') || t.includes('Mongo') || t.includes('Redis')
  );

  if (hasDB) {
    lines.push('');
    lines.push('  subgraph DBLAYER["🗄️  Veri Katmanı — Persistence"]');
    lines.push('    direction TB');

    if (techStack.includes('Prisma ORM')) {
      lines.push('    PRISMA[("🔷 Prisma Client\\nORM · Type-Safe\\nSorgu Yap")]');
    }
    if (techStack.includes('MongoDB/Mongoose')) {
      lines.push('    MONGO[("🍃 MongoDB\\nDocument Store\\nNoSQL Veritabanı")]');
    }
    if (techStack.includes('PostgreSQL')) {
      lines.push('    PG[("🐘 PostgreSQL\\nRelational DB\\nSQL Veritabanı")]');
    }
    if (techStack.includes('Redis')) {
      lines.push('    REDIS[("⚡ Redis\\nIn-Memory Cache\\nSession · Rate Limit")]');
    }
    // Show model files
    if (dbModels.length > 0) {
      const MAX_DB = Math.min(dbModels.length, 3);
      dbModels.slice(0, MAX_DB).forEach((m, i) => {
        const name = path.basename(m, path.extname(m));
        lines.push(`    SCHEMA${i}["📋 ${sanitizeLabel(name)}\\nVeri Modeli · Schema"]`);
      });
    }
    lines.push('  end');
  }

  // =============================
  // 6. EXTERNAL SERVICES
  // =============================
  const hasAuth = techStack.includes('Auth (NextAuth)');
  const hasWs = techStack.includes('WebSockets');
  const hasGql = techStack.includes('GraphQL');

  if (hasAuth || hasWs || hasGql) {
    lines.push('');
    lines.push('  subgraph EXTERNAL["🌍  Harici Servisler"]');
    lines.push('    direction TB');
    if (hasAuth) lines.push('    AUTH["🔐 Auth Provider\\nNextAuth · OAuth 2.0\\nJWT · Session"]');
    if (hasWs) lines.push('    WS["📡 WebSocket Server\\nGerçek Zamanlı\\nBidirectional"]');
    if (hasGql) lines.push('    GQL["🔺 GraphQL\\nApollo Server\\nResolver Katmanı"]');
    lines.push('  end');
  }

  // =============================
  // CONNECTIONS
  // =============================
  lines.push('');

  // Entry → Pages/API
  if (middlewares.length > 0) {
    if (pageRoutes.length > 0) lines.push('  MW_CHAIN -->|"2. Yönlendirme\\n(auth geçti)"| P0');
    if (apiRoutes.length > 0) lines.push('  MW_CHAIN -->|"2. API Yönlendirme\\n(/api/* eşleşti)"| A0');
  } else {
    if (pageRoutes.length > 0) lines.push('  CLIENT -->|"1. GET /route\\nSayfa İsteği"| P0');
    if (apiRoutes.length > 0) lines.push('  CLIENT -->|"1. fetch() / axios\\nAPI İsteği"| A0');
  }

  // Pages ↔ API
  if (pageRoutes.length > 0 && apiRoutes.length > 0) {
    lines.push('  P0 -->|"Server Action\\nया Client fetch()"| A0');
  }

  // Pages/API → Services
  if (serverModules.length > 0) {
    if (apiRoutes.length > 0) {
      lines.push('  A0 -->|"İş Mantığı\\nYetki · Doğrulama"| SVC0');
    } else if (pageRoutes.length > 0) {
      lines.push('  P0 -->|"Server Action Çağrısı"| SVC0');
    }
  }

  // Services / API → DB
  if (hasDB) {
    const srcId = serverModules.length > 0 ? 'SVC0' : apiRoutes.length > 0 ? 'A0' : 'P0';
    if (techStack.includes('Prisma ORM')) {
      lines.push(`  ${srcId} -->|"Prisma Query\\n(findMany · create · update)"| PRISMA`);
      if (techStack.includes('PostgreSQL')) lines.push('  PRISMA -->|"SQL Çeviri\\nConnection Pool"| PG');
      if (techStack.includes('MongoDB/Mongoose')) lines.push('  PRISMA -->|"Document Write/Read"| MONGO');
    } else if (techStack.includes('MongoDB/Mongoose')) {
      lines.push(`  ${srcId} -->|"Mongoose.find()\\n.create() .save()"| MONGO`);
    } else if (techStack.includes('PostgreSQL')) {
      lines.push(`  ${srcId} -->|"SQL Query\\npool.query()"| PG`);
    }
    if (techStack.includes('Redis')) {
      lines.push(`  ${srcId} -.->|"Cache.get()\\nCache.set() TTL"| REDIS`);
    }
    // Schema → DB connection
    if (dbModels.length > 0) {
      const dbTarget = techStack.includes('Prisma ORM') ? 'PRISMA' : techStack.includes('MongoDB/Mongoose') ? 'MONGO' : techStack.includes('PostgreSQL') ? 'PG' : null;
      if (dbTarget) lines.push(`  SCHEMA0 -.->|"Schema Tanımı"| ${dbTarget}`);
    }
  }

  // Auth
  if (hasAuth) {
    if (middlewares.length > 0) {
      lines.push('  MW_CHAIN -->|"JWT Doğrula\\nSession Kontrol"| AUTH');
      lines.push('  AUTH -.->|"Token · Session"| MW_CHAIN');
    } else if (pageRoutes.length > 0) {
      lines.push('  P0 -.->|"getSession()\\nKorumalı Rota"| AUTH');
    }
  }

  // WebSocket
  if (hasWs) {
    lines.push('  CLIENT <-->|"ws:// / wss://\\nGerçek Zamanlı Kanal"| WS');
  }

  // GraphQL
  if (hasGql) {
    if (apiRoutes.length > 0) lines.push('  A0 -->|"GraphQL Query\\nMutation · Subscription"| GQL');
    if (hasDB && techStack.includes('Prisma ORM')) lines.push('  GQL -->|"Resolver → Prisma"| PRISMA');
  }

  // Response flows back
  if (pageRoutes.length > 0) {
    lines.push('  P0 -.->|"HTML · RSC Payload\\nHydration"| CLIENT');
  }
  if (apiRoutes.length > 0) {
    lines.push('  A0 -.->|"JSON Response\\nStatus Code"| CLIENT');
  }

  // =============================
  // APPLY CLASSES
  // =============================
  lines.push('  class CLIENT entry');
  if (middlewares.length > 0) lines.push('  class MW_CHAIN mw');
  pageRoutes.slice(0, 7).forEach((_, i) => lines.push(`  class P${i} page`));
  apiRoutes.slice(0, 8).forEach((_, i) => lines.push(`  class A${i} api`));
  serverModules.slice(0, 6).forEach((_, i) => lines.push(`  class SVC${i} server`));
  dbModels.slice(0, 3).forEach((_, i) => lines.push(`  class SCHEMA${i} db`));
  if (hasAuth) lines.push('  class AUTH ext');
  if (hasWs) lines.push('  class WS ext');
  if (hasGql) lines.push('  class GQL ext');
  if (techStack.includes('Prisma ORM')) lines.push('  class PRISMA db');
  if (techStack.includes('MongoDB/Mongoose')) lines.push('  class MONGO db');
  if (techStack.includes('PostgreSQL')) lines.push('  class PG db');
  if (techStack.includes('Redis')) lines.push('  class REDIS db');

  return lines.join('\n');
}
