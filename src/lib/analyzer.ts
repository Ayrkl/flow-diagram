import { promises as fs } from 'fs';
import path from 'path';

export interface ProjectAnalysis {
  techStack: string[];
  fileTree: any;
  architecture: string;
  flowDiagram: string;
  stats: {
    files: number;
    folders: number;
    languages: Record<string, number>;
  };
}

const IGNORE_LIST = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.vscode', 'coverage']);

export async function analyzeProject(directoryPath: string): Promise<ProjectAnalysis> {
  const stats = {
    files: 0,
    folders: 0,
    languages: {} as Record<string, number>,
  };

  const techStack = new Set<string>();
  
  // 1. Scan for Tech Signatures
  try {
    const rootFiles = await fs.readdir(directoryPath);
    
    if (rootFiles.includes('package.json')) {
      const pkg = JSON.parse(await fs.readFile(path.join(directoryPath, 'package.json'), 'utf-8'));
      techStack.add('JavaScript/TypeScript');
      if (pkg.dependencies?.next) techStack.add('Next.js');
      if (pkg.dependencies?.react) techStack.add('React');
      if (pkg.dependencies?.express) techStack.add('Express');
      if (pkg.dependencies?.tailwindcss) techStack.add('TailwindCSS');
      if (pkg.devDependencies?.typescript) techStack.add('TypeScript');
    }
    
    if (rootFiles.includes('go.mod')) techStack.add('Go');
    if (rootFiles.includes('requirements.txt') || rootFiles.includes('pyproject.toml')) techStack.add('Python');
    if (rootFiles.includes('pom.xml')) techStack.add('Java (Maven)');
    if (rootFiles.includes('Dockerfile')) techStack.add('Docker');
  } catch (e) {
    throw new Error('Could not read project directory. Path may be incorrect.');
  }

  // 2. Recursive File Walker
  async function walk(dir: string, depth = 0): Promise<any> {
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
  if (fileTree.children?.some((c: any) => c.name === 'src' && c.type === 'directory')) {
    architecture = 'SRC-based Structure';
  }
  if (techStack.has('Next.js')) {
    architecture = 'Next.js App Router Architecture';
  }

  // 4. Generate Mermaid Diagrams
  const flowDiagram = generateMermaidFlow(fileTree, Array.from(techStack));

  return {
    techStack: Array.from(techStack),
    fileTree,
    architecture,
    flowDiagram,
    stats
  };
}

function generateMermaidFlow(tree: any, tech: string[]): string {
  let diagram = 'graph TD\n';
  diagram += '  Start((User Request)) --> Entry[Entry Point]\n';
  
  if (tech.includes('Next.js')) {
    diagram += '  Entry --> Routes[App Router]\n';
    diagram += '  Routes --> ServerComponents[Server Components]\n';
    diagram += '  ServerComponents --> ClientComponents[Client Components]\n';
    diagram += '  ServerComponents --> API[API Routes]\n';
  } else if (tech.includes('Express')) {
    diagram += '  Entry --> Middleware[Middlewares]\n';
    diagram += '  Middleware --> Routers[Express Routers]\n';
    diagram += '  Routers --> Controllers[Business Logic]\n';
  } else {
    diagram += '  Entry --> Modules[Project Modules]\n';
  }

  return diagram;
}
