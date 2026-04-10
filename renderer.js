const selectDirBtn = document.getElementById('selectDirBtn');
const analyzeBtn = document.getElementById('analyzeBtn');
const directoryPathInput = document.getElementById('directoryPath');
const resultsArea = document.getElementById('results');
const loader = document.getElementById('loader');

// State
let currentPath = '';
let currentResult = null;

// Initialize Mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  fontFamily: 'Inter',
});

// Event Listeners
selectDirBtn.addEventListener('click', async () => {
  const path = await window.electronAPI.openDirectory();
  if (path) {
    currentPath = path;
    directoryPathInput.value = path;
    analyzeBtn.disabled = false;
  }
});

analyzeBtn.addEventListener('click', async () => {
  if (!currentPath) return;

  loader.classList.remove('hidden');
  resultsArea.classList.add('hidden');

  try {
    const result = await window.electronAPI.analyzeProject(currentPath);
    currentResult = result;
    displayResults(result);
  } catch (error) {
    alert('Hata oluştu: ' + error.message);
  } finally {
    loader.classList.add('hidden');
  }
});

function displayResults(data) {
  resultsArea.classList.remove('hidden');

  // Stats
  document.getElementById('fileCount').textContent = data.stats.files;
  document.getElementById('folderCount').textContent = data.stats.folders;
  document.getElementById('archName').textContent = data.architecture;

  // Tech Stack
  const techContainer = document.getElementById('techStack');
  techContainer.innerHTML = '';
  data.techStack.forEach(tech => {
    const span = document.createElement('span');
    span.textContent = tech;
    techContainer.appendChild(span);
  });

  // Diagram
  const diagramContainer = document.getElementById('mermaidDiagram');
  diagramContainer.innerHTML = '';
  
  // Use mermaid to render
  const id = 'mermaid-' + Date.now();
  diagramContainer.innerHTML = `<div class="mermaid" id="${id}">${data.flowDiagram}</div>`;
  mermaid.render(id + '-svg', data.flowDiagram).then(({ svg }) => {
    diagramContainer.innerHTML = svg;
  });
}

document.getElementById('downloadBtn').addEventListener('click', () => {
  if (!currentResult) return;

  const content = `CodeFlow Analysis Report\n\n` +
    `Path: ${currentPath}\n` +
    `Architecture: ${currentResult.architecture}\n` +
    `Tech Stack: ${currentResult.techStack.join(', ')}\n\n` +
    `Stats:\n` +
    `- Total Files: ${currentResult.stats.files}\n` +
    `- Total Folders: ${currentResult.stats.folders}\n\n` +
    `Diagram Source:\n${currentResult.flowDiagram}`;

  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'project-analysis.txt';
  a.click();
});
