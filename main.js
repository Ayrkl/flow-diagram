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

ipcMain.handle('open-file', async (event, filePath) => {
  if (!filePath) return;
  exec(`code "${filePath}"`, (err) => {
    if (err) shell.openPath(filePath);
  });
});

// ============================================================
// DEEP PROJECT ANALYSIS ENGINE (V3 - OPTIMIZED FLOW)
// ============================================================

const IGNORE_LIST = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '.vscode',
  'coverage', 'obj', 'bin', '__pycache__', '.idea', 'vendor', 'out'
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

async function analyzeProject(baseDir) {
  const stats = { files: 0, folders: 0, languages: {} };
  const techStack = new Set();
  
  try {
    const rootFiles = await fs.readdir(baseDir);
    if (rootFiles.includes('package.json')) {
      const pkg = JSON.parse(await fs.readFile(path.join(baseDir, 'package.json'), 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
      
      techStack.add('JavaScript/TypeScript');
      if (allDeps.next) techStack.add('Next.js');
      if (allDeps.react) techStack.add('React');
      if (allDeps.express) techStack.add('Express');
      if (allDeps.fastify) techStack.add('Fastify');
      if (allDeps.nestjs || allDeps['@nestjs/core']) techStack.add('NestJS');
      if (allDeps.prisma || allDeps['@prisma/client']) techStack.add('Prisma ORM');
      if (allDeps.mongoose || allDeps.mongodb) techStack.add('MongoDB');
      if (allDeps.pg || allDeps.sequelize) techStack.add('PostgreSQL');
      if (allDeps.mysql || allDeps.mysql2) techStack.add('MySQL');
      if (allDeps.sqlite3 || allDeps.better_sqlite3) techStack.add('SQLite');
      if (allDeps.redis || allDeps.ioredis) techStack.add('Redis');
      if (allDeps.tailwindcss) techStack.add('TailwindCSS');
      if (allDeps.firebase || allDeps['firebase-admin']) techStack.add('Firebase');
      if (allDeps.graphql || allDeps['@apollo/client']) techStack.add('GraphQL');
      if (allDeps.typescript) techStack.add('TypeScript');
      if (allDeps.vite) techStack.add('Vite');
      if (allDeps.electron) techStack.add('Electron');
      if (allDeps['socket.io'] || allDeps['socket.io-client']) techStack.add('WebSockets');
    }
    if (rootFiles.includes('Dockerfile') || rootFiles.includes('docker-compose.yml')) techStack.add('Docker');
    if (rootFiles.includes('go.mod')) techStack.add('Go');
    if (rootFiles.includes('requirements.txt') || rootFiles.includes('pyproject.toml')) techStack.add('Python');
    if (rootFiles.includes('.env') || rootFiles.includes('.env.local')) techStack.add('Env Config');
  } catch (e) {}

  const fileMap = {}; 
  const groups = { api: [], pages: [], components: [], services: [], models: [], mw: [] };

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

        if (SOURCE_EXTENSIONS.has(ext)) {
          const lower = relPath.toLowerCase();
          let type = 'other';
          
          if (lower.includes('/api/') && (lower.endsWith('route.ts') || lower.endsWith('route.js'))) {
            type = 'api'; groups.api.push(relPath);
          } else if (lower.endsWith('page.tsx') || lower.endsWith('page.ts') || lower.endsWith('page.js')) {
            type = 'page'; groups.pages.push(relPath);
          } else if (lower.includes('/actions/') || lower.includes('/services/') || lower.includes('/server/')) {
            type = 'service'; groups.services.push(relPath);
          } else if (lower.includes('/models/') || lower.includes('/schema') || lower.includes('/prisma')) {
            type = 'model'; groups.models.push(relPath);
          } else if (lower.includes('middleware')) {
            type = 'mw'; groups.mw.push(relPath);
          } else if (lower.includes('/components/')) {
            type = 'component'; 
            if (!lower.includes('/ui/') && !lower.includes('/shadcn/')) groups.components.push(relPath);
          }

          const content = await fs.readFile(fullPath, 'utf-8');
          const imports = extractImports(content, relPath, baseDir);
          fileMap[relPath] = { type, imports, fullPath };
        }
      }
    }
  }

  await walk(baseDir);

  const { flowDiagram, nodePathMap } = generateOptimizedDiagram(fileMap, groups, baseDir, techStack);

  return {
    baseDir,
    techStack: Array.from(techStack),
    architecture: groups.pages.length > 0 ? 'Next.js App Router Architecture' : 'Modular Architecture',
    flowDiagram,
    nodePathMap,
    stats,
    details: {
      apiRoutes: groups.api,
      pageRoutes: groups.pages,
      components: groups.components.length,
      dbModels: groups.models,
      middlewares: groups.mw,
      fullPaths: { apiRoutes: groups.api, pageRoutes: groups.pages, dbModels: groups.models, middlewares: groups.mw }
    }
  };
}

function extractImports(content, currentRelPath, baseDir) {
  const imports = [];
  const currentDir = path.dirname(currentRelPath);
  const patterns = [
    /from\s+['"]([^'"]+)['"]/g,
    /import\s*\(?\s*['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const impPath = match[1];
      if (impPath.startsWith('.') || impPath.startsWith('@/')) {
        let resolved = impPath;
        if (impPath.startsWith('@/')) {
          const possibleRoots = ['', 'src'];
          for (const r of possibleRoots) {
            const joined = path.join(r, impPath.replace('@/', '')).replace(/\\/g, '/');
            imports.push(joined);
          }
        } else {
          resolved = path.join(currentDir, impPath).replace(/\\/g, '/');
          imports.push(resolved);
        }
      }
    }
  }
  return [...new Set(imports)];
}

/**
 * GENERATE OPTIMIZED DIAGRAM (V3)
 */
function generateOptimizedDiagram(fileMap, groups, baseDir, techStack) {
  const lines = ['flowchart LR'];
  const nodePathMap = {};
  const activeNodes = new Set();
  const rawEdges = [];

  // Style definitions
  lines.push('  classDef entry fill:#050510,stroke:#00ff88,color:#00ff88,stroke-width:2px');
  lines.push('  classDef page fill:#0d2a1a,stroke:#00ff88,color:#ccffd6,stroke-width:1.5px');
  lines.push('  classDef api fill:#0d1f2e,stroke:#00d4ff,color:#c4eeff,stroke-width:1.5px');
  lines.push('  classDef svc fill:#0d1e1e,stroke:#34d399,color:#b5f5e0,stroke-width:1.5px');
  lines.push('  classDef model fill:#1e0d2e,stroke:#a855f7,color:#e2c6ff,stroke-width:1.5px');
  lines.push('  classDef mw fill:#2e0d0d,stroke:#f97316,color:#ffe0c4,stroke-width:1.5px');

  const sanitizeId = (p) => p.replace(/[^a-zA-Z0-9]/g, '_');
  
  const getBreadcrumbName = (p) => {
    let parts = p.replace(/\.(tsx?|jsx?)$/, '').split('/');
    // Filter out common naming noise
    parts = parts.filter(pt => pt !== 'src' && pt !== 'app' && pt !== 'pages' && pt !== 'api');
    if (parts[parts.length-1] === 'page' || parts[parts.length-1] === 'route') {
        return parts.slice(-2).join('/');
    }
    return parts.slice(-1)[0] || 'index';
  };

  // 1. Anchor Entry Flow
  lines.push('  subgraph ENTRY["📥 Giriş"]');
  lines.push('    CLIENT(["👤 İstemci / Tarayıcı"])');
  if (groups.mw.length > 0) {
    const mwId = sanitizeId(groups.mw[0]);
    lines.push(`    ${mwId}["🛡️ Middleware"]`);
    lines.push(`    CLIENT --> ${mwId}`);
    activeNodes.add(mwId);
    nodePathMap[mwId] = path.join(baseDir, groups.mw[0]);
  }
  lines.push('  end');
  lines.push('  class CLIENT entry');

  // 2. Build Dependency Map
  Object.entries(fileMap).forEach(([relPath, data]) => {
    const id = sanitizeId(relPath);
    nodePathMap[id] = path.join(baseDir, relPath);
    
    data.imports.forEach(imp => {
      const candidates = [imp, imp + '.ts', imp + '.tsx', imp + '.js', imp + '.jsx', imp + '/index.ts', imp + '/index.tsx'];
      for (const cand of candidates) {
        if (fileMap[cand]) {
          const targetId = sanitizeId(cand);
          if (fileMap[relPath].type !== fileMap[cand].type) {
            rawEdges.push({ from: id, to: targetId });
            activeNodes.add(id);
            activeNodes.add(targetId);
          }
          break;
        }
      }
    });
  });

  // 3. Connect Entry to Pages/API
  const entryId = groups.mw.length > 0 ? sanitizeId(groups.mw[0]) : 'CLIENT';
  groups.pages.slice(0, 4).forEach(p => {
    const pid = sanitizeId(p);
    rawEdges.push({ from: entryId, to: pid });
    activeNodes.add(pid);
  });
  groups.api.slice(0, 4).forEach(a => {
    const aid = sanitizeId(a);
    rawEdges.push({ from: entryId, to: aid });
    activeNodes.add(aid);
  });

  // 4. Grouping by Directory (Simplified - Flat categorical view)
  const drawCategorizedGroups = (categoryFiles, parentName, className, limit = 8) => {
    const activeFiles = categoryFiles.filter(f => activeNodes.has(sanitizeId(f)));
    if (activeFiles.length === 0) return;

    const gId = sanitizeId(parentName);
    lines.push(`  subgraph ${gId}["${parentName}"]`);
    activeFiles.slice(0, limit).forEach(f => {
        const id = sanitizeId(f);
        lines.push(`    ${id}["${getBreadcrumbName(f)}"]`);
        lines.push(`    class ${id} ${className}`);
    });
    lines.push('  end');
  };

  drawCategorizedGroups(groups.pages, '📄 Sayfalar', 'page', 10);
  drawCategorizedGroups(groups.api, '🔌 API Katmanı', 'api', 8);
  drawCategorizedGroups(groups.services, '⚙️ İş Mantığı', 'svc', 12);
  drawCategorizedGroups(groups.models, '🗄️ Modeller', 'model', 6);

  // 5. Final Edge Pruning and Drawing
  // Transitive reduction: if A->B and B->C, remove A->C
  const finalEdges = rawEdges.filter((edge, index) => {
    const hasIntermediate = rawEdges.some(e2 => e2.from === edge.from && rawEdges.some(e3 => e3.from === e2.to && e3.to === edge.to));
    return !hasIntermediate;
  });

  finalEdges.slice(0, 25).forEach(e => {
    lines.push(`  ${e.from} --> ${e.to}`);
  });

  return { flowDiagram: lines.join('\n'), nodePathMap };
}
