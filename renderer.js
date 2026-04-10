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
    const uid = 'diagram-' + Date.now();
    const { svg } = await mermaid.render(uid, data.flowDiagram);
    diagramContainer.innerHTML = svg;
  } catch (e) {
    diagramContainer.innerHTML = `<pre style="color:#f97316;font-size:0.75rem;white-space:pre-wrap">${e.message}\n\n${data.flowDiagram}</pre>`;
  }

  // Show download image button
  document.getElementById('downloadImgBtn').classList.remove('hidden');
}

function getMeaningfulLabel(filePath) {
  const normPath = filePath.replace(/\\/g, '/');
  const parts = normPath.split('/');
  const filename = parts[parts.length - 1];

  // API route: everything between /api/ and the filename
  if (filename === 'route.ts' || filename === 'route.js' || filename === 'route.tsx') {
    const apiIdx = parts.findIndex(p => p === 'api');
    if (apiIdx !== -1) {
      const routeParts = parts
        .slice(apiIdx + 1, parts.length - 1)
        .filter(p => !(p.startsWith('(') && p.endsWith(')')));
      return { label: '/api/' + (routeParts.join('/') || '…'), tooltip: normPath };
    }
  }

  // Page route: strip known prefixes and route groups
  if (filename === 'page.tsx' || filename === 'page.ts' || filename === 'page.jsx' || filename === 'page.js') {
    let capture = false;
    const pageParts = [];
    for (const part of parts) {
      // Start capturing after 'app' or 'pages'
      if (part === 'app' || part === 'pages') { capture = true; continue; }
      if (!capture) continue;
      // Skip the file itself
      if (part.startsWith('page.')) continue;
      // Skip route groups like (auth), (protected)
      if (part.startsWith('(') && part.endsWith(')')) continue;
      pageParts.push(part);
    }
    const routePath = '/' + pageParts.join('/');
    return { label: pageParts.length === 0 ? '/ (Ana Sayfa)' : routePath, tooltip: normPath };
  }

  // Fallback
  return { label: filename, tooltip: normPath };
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
      const { label, tooltip } = getMeaningfulLabel(item);
      return `<li title="${tooltip}">${icon} ${label}</li>`;
    })
    .join('');
}

// Download diagram as PNG image
async function downloadDiagramAsPng() {
  const svgEl = document.querySelector('#mermaidDiagram svg');
  if (!svgEl) { alert('\u00d6nce analiz yap\u0131n.'); return; }

  try {
    // Clone SVG and add explicit dimensions so canvas can measure it
    const bbox = svgEl.getBoundingClientRect();
    const w = Math.round(bbox.width) || 1200;
    const h = Math.round(bbox.height) || 800;

    const clone = svgEl.cloneNode(true);
    clone.setAttribute('width', w);
    clone.setAttribute('height', h);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    // Encode as data URL (avoids Electron blob URL cross-origin issues)
    const svgStr = new XMLSerializer().serializeToString(clone);
    const encoded = encodeURIComponent(svgStr);
    const dataUrl = 'data:image/svg+xml,' + encoded;

    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0d0d1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, w, h);
      const link = document.createElement('a');
      link.download = 'codeflow-diagram.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.onerror = () => {
      // Fallback: save as SVG instead
      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'codeflow-diagram.svg';
      a.click();
      URL.revokeObjectURL(url);
      alert('PNG dönü\u015fümü ba\u015far\u0131s\u0131z. SVG olarak kaydedildi.');
    };
    img.src = dataUrl;
  } catch (err) {
    console.error('PNG download error:', err);
    alert('PNG indirme hatas\u0131: ' + err.message);
  }
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

document.getElementById('downloadImgBtn').addEventListener('click', downloadDiagramAsPng);
