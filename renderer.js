const selectDirBtn = document.getElementById('selectDirBtn');
const analyzeBtn = document.getElementById('analyzeBtn');
const directoryPathInput = document.getElementById('directoryPath');
const resultsArea = document.getElementById('results');
const loader = document.getElementById('loader');

let currentPath = '';
let currentResult = null;

// Initialize Mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  fontFamily: 'Inter, monospace',
  flowchart: { curve: 'basis', padding: 20 },
});

// Event: Select directory
selectDirBtn.addEventListener('click', async () => {
  const p = await window.electronAPI.openDirectory();
  if (p) {
    currentPath = p;
    directoryPathInput.value = p;
    analyzeBtn.disabled = false;
  }
});

// Event: Run analysis
analyzeBtn.addEventListener('click', async () => {
  if (!currentPath) return;
  loader.classList.remove('hidden');
  resultsArea.classList.add('hidden');

  try {
    const result = await window.electronAPI.analyzeProject(currentPath);
    currentResult = result;
    await displayResults(result);
  } catch (error) {
    alert('Hata: ' + error.message);
  } finally {
    loader.classList.add('hidden');
  }
});

async function displayResults(data) {
  resultsArea.classList.remove('hidden');

  // Stats
  document.getElementById('fileCount').textContent = data.stats.files;
  document.getElementById('folderCount').textContent = data.stats.folders;
  document.getElementById('archName').textContent = data.architecture;

  // Tech Stack
  const techContainer = document.getElementById('techStack');
  techContainer.innerHTML = data.techStack.length
    ? data.techStack.map(t => `<span>${t}</span>`).join('')
    : '<span style="color:#666">Tespit edilemedi</span>';

  // Detail lists
  renderDetailList('apiList', data.details.apiRoutes, '🔌');
  renderDetailList('pageList', data.details.pageRoutes, '📄');
  renderDetailList('dbList', data.details.dbModels, '📦');
  renderDetailList('mwList', data.details.middlewares, '⚙️');

  // Component count badge
  const compEl = document.getElementById('componentCount');
  if (compEl) compEl.textContent = data.details.components + ' bileşen';

  // Render Mermaid diagram
  const diagramContainer = document.getElementById('mermaidDiagram');
  diagramContainer.innerHTML = '';
  try {
    const { svg } = await mermaid.render('diagram-svg', data.flowDiagram);
    diagramContainer.innerHTML = svg;
  } catch (e) {
    diagramContainer.innerHTML = `<pre style="color:#f97316;font-size:0.75rem;white-space:pre-wrap">${e.message}\n\n${data.flowDiagram}</pre>`;
  }
}

function getMeaningfulLabel(itemPath, icon) {
  const parts = itemPath.split('/');
  const filename = parts[parts.length - 1];

  // API route: show parent folders after "api/"
  if (filename === 'route.ts' || filename === 'route.js') {
    const apiIdx = parts.indexOf('api');
    if (apiIdx !== -1) {
      const routeParts = parts
        .slice(apiIdx + 1, parts.length - 1) // exclude filename
        .filter(p => !p.startsWith('('));     // exclude (groups)
      const label = '/' + (routeParts.join('/') || 'root');
      return { label, tooltip: itemPath };
    }
  }

  // Page route: show cleaned path without page.tsx / page.jsx
  if (filename.startsWith('page.')) {
    const pageParts = parts
      .filter(p => !['src', 'app', 'pages'].includes(p))
      .filter(p => !p.startsWith('page.'))
      .filter(p => !p.startsWith('(') || p.endsWith(')')) // keep (groups) for tooltip but strip
      .map(p => p.startsWith('(') && p.endsWith(')') ? null : p)
      .filter(Boolean);
    const label = '/' + (pageParts.join('/') || '');
    return { label: label === '/' ? '/ (Ana Sayfa)' : label, tooltip: itemPath };
  }

  // Fallback: just the filename
  return { label: filename, tooltip: itemPath };
}

function renderDetailList(containerId, items, icon) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!items || items.length === 0) {
    el.innerHTML = '<li style="color:#555">Bulunamadı</li>';
    return;
  }
  el.innerHTML = items
    .map(item => {
      const { label, tooltip } = getMeaningfulLabel(item, icon);
      return `<li title="${tooltip}">${icon} ${label}</li>`;
    })
    .join('');
}

// Download TXT report
document.getElementById('downloadBtn').addEventListener('click', () => {
  if (!currentResult) return;
  const d = currentResult.details;
  const content = [
    '=== CodeFlow Architect - Proje Analiz Raporu ===',
    '',
    `Proje Yolu   : ${currentPath}`,
    `Mimari       : ${currentResult.architecture}`,
    `Teknolojiler : ${currentResult.techStack.join(', ')}`,
    '',
    '--- İstatistikler ---',
    `Toplam Dosya   : ${currentResult.stats.files}`,
    `Toplam Klasör  : ${currentResult.stats.folders}`,
    `Bileşen Sayısı : ${d.components}`,
    '',
    '--- API Rotaları ---',
    ...(d.apiRoutes.length ? d.apiRoutes.map(r => '  • ' + r) : ['  (yok)']),
    '',
    '--- Sayfa Rotaları ---',
    ...(d.pageRoutes.length ? d.pageRoutes.map(r => '  • ' + r) : ['  (yok)']),
    '',
    '--- Veri Modelleri ---',
    ...(d.dbModels.length ? d.dbModels.map(r => '  • ' + r) : ['  (yok)']),
    '',
    '--- Middleware ---',
    ...(d.middlewares.length ? d.middlewares.map(r => '  • ' + r) : ['  (yok)']),
    '',
    '--- Giriş Noktaları ---',
    ...(d.entryPoints.length ? d.entryPoints.map(r => '  • ' + r) : ['  (yok)']),
    '',
    '--- Akış Diyagramı (Mermaid) ---',
    currentResult.flowDiagram,
  ].join('\n');

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'codeflow-analysis.txt';
  a.click();
  URL.revokeObjectURL(url);
});
