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
  flowchart: { 
    curve: 'stepAfter', 
    padding: 30, 
    nodeSpacing: 60, 
    rankSpacing: 80,
    htmlLabels: true
  },
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
  renderDetailList('apiList', data.details.apiRoutes, data.details.fullPaths.apiRoutes, '🔌');
  renderDetailList('pageList', data.details.pageRoutes, data.details.fullPaths.pageRoutes, '📄');
  renderDetailList('dbList', data.details.dbModels, data.details.fullPaths.dbModels, '📦');
  renderDetailList('mwList', data.details.middlewares, data.details.fullPaths.middlewares, '⚙️');

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

    // Attach click listeners to diagram nodes
    attachDiagramListeners(data.nodePathMap);
  } catch (e) {
    diagramContainer.innerHTML = `<pre style="color:#f97316;font-size:0.75rem;white-space:pre-wrap">${e.message}\n\n${data.flowDiagram}</pre>`;
  }

  // Show download image button
  document.getElementById('downloadImgBtn').classList.remove('hidden');
}

// Function to attach click listeners to Merit nodes
function attachDiagramListeners(nodePathMap) {
  const nodes = document.querySelectorAll('.mermaid-viewer .node');
  nodes.forEach(node => {
    // Mermaid node IDs are typically prefixed or cleaned, but often correspond to the ID in the DSL
    // We can use the ID attribute or data-id if available (Mermaid 10+ uses different attributes)
    const id = node.id.split('-')[1] || node.id; 
    
    // Some versions of Mermaid might use different ID formats. Let's try to find a match.
    // Usually, if we defined 'P0', the node ID might be 'P0' or the SVG element will have a class/id like 'flowchart-P0-...'
    
    // Easier way: look for the ID in our map
    Object.keys(nodePathMap).forEach(key => {
        if (node.id.includes(key)) {
            node.style.cursor = 'pointer';
            node.addEventListener('click', () => {
                window.electronAPI.openFile(nodePathMap[key]);
            });
        }
    });
  });
}

function getMeaningfulLabel(filePath) {
  const normPath = filePath.replace(/\\/g, '/');
  const parts = normPath.split('/');
  const filename = parts[parts.length - 1];

  if (filename === 'route.ts' || filename === 'route.js' || filename === 'route.tsx') {
    const apiIdx = parts.findIndex(p => p === 'api');
    if (apiIdx !== -1) {
      const routeParts = parts
        .slice(apiIdx + 1, parts.length - 1)
        .filter(p => !(p.startsWith('(') && p.endsWith(')')));
      return { label: '/api/' + (routeParts.join('/') || '…') + '/' + filename, tooltip: normPath };
    }
  }

  if (filename === 'page.tsx' || filename === 'page.ts' || filename === 'page.jsx' || filename === 'page.js') {
    let capture = false;
    const pageParts = [];
    for (const part of parts) {
      if (part === 'app' || part === 'pages') { capture = true; continue; }
      if (!capture) continue;
      if (part.startsWith('page.')) continue;
      if (part.startsWith('(') && part.endsWith(')')) continue;
      pageParts.push(part);
    }
    const routePath = '/' + pageParts.join('/');
    return { label: (routePath === '/' ? '/' : routePath + '/') + filename, tooltip: normPath };
  }

  return { label: filename, tooltip: normPath };
}

function renderDetailList(containerId, routes, fullPaths, icon) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!routes || routes.length === 0) {
    el.innerHTML = '<li style="color:#555">Bulunamadı</li>';
    return;
  }
  
  el.innerHTML = '';
  routes.forEach((route, i) => {
    const { label, tooltip } = getMeaningfulLabel(route);
    const li = document.createElement('li');
    li.title = tooltip;
    li.className = 'interactive-li';
    li.innerHTML = `${icon} ${label}`;
    
    // Click to open
    li.addEventListener('click', () => {
      const absPath = currentResult.baseDir + '/' + fullPaths[i];
      window.electronAPI.openFile(absPath.replace(/\/\//g, '/'));
    });
    
    el.appendChild(li);
  });
}

// Download diagram as PNG
async function downloadDiagramAsPng() {
  const svgEl = document.querySelector('#mermaidDiagram svg');
  if (!svgEl) return;
  try {
    const bbox = svgEl.getBoundingClientRect();
    const w = Math.round(bbox.width) || 1200;
    const h = Math.round(bbox.height) || 800;
    const clone = svgEl.cloneNode(true);
    clone.setAttribute('width', w);
    clone.setAttribute('height', h);
    const svgStr = new XMLSerializer().serializeToString(clone);
    const encoded = encodeURIComponent(svgStr);
    const dataUrl = 'data:image/svg+xml,' + encoded;
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = w * scale; canvas.height = h * scale;
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
    img.src = dataUrl;
  } catch (err) { console.error(err); }
}

// Download TXT report
document.getElementById('downloadBtn').addEventListener('click', () => {
  if (!currentResult) return;
  const d = currentResult.details;
  const content = [
    '=== CodeFlow Architect - Analiz Raporu ===',
    `Yol: ${currentPath}\nMimari: ${currentResult.architecture}`,
    `Teknoloji: ${currentResult.techStack.join(', ')}`,
    '',
    '--- Rotalar ---',
    ...d.apiRoutes.map(r => ' • ' + r),
    '',
    '--- Sayfalar ---',
    ...d.pageRoutes.map(r => ' • ' + r),
    '',
    '--- Diyagram ---',
    currentResult.flowDiagram
  ].join('\n');
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'codeflow-analiz.txt'; a.click();
});

document.getElementById('downloadImgBtn').addEventListener('click', downloadDiagramAsPng);
