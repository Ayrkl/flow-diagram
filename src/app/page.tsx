'use client';

import { useState } from 'react';
import { 
  FolderSearch, 
  Cpu, 
  Files, 
  Network, 
  Download, 
  CheckCircle2, 
  Loader2,
  AlertCircle,
  Layout as LayoutIcon,
  ChevronRight
} from 'lucide-react';
import Mermaid from '@/components/Mermaid';

export default function Home() {
  const [path, setPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleScan = async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadReport = () => {
    if (!result) return;
    const content = `CodeFlow Analysis Report\n\n` +
      `Path: ${path}\n` +
      `Architecture: ${result.architecture}\n` +
      `Tech Stack: ${result.techStack.join(', ')}\n\n` +
      `Stats:\n` +
      `- Total Files: ${result.stats.files}\n` +
      `- Total Folders: ${result.stats.folders}\n\n` +
      `Diagram Source:\n${result.flowDiagram}`;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'project-analysis.txt';
    a.click();
  };

  return (
    <main className="min-h-screen p-8 md:p-16 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col items-center text-center space-y-4 mb-16 animate-fade-in">
        <div className="p-3 bg-white/5 rounded-2xl border border-white/10 mb-2">
          <FolderSearch className="w-10 h-10 text-[#00ff88]" />
        </div>
        <h1 className="text-5xl font-black tracking-tight">
          <span className="gradient-text">CodeFlow</span> Architect
        </h1>
        <p className="text-zinc-400 text-lg max-w-xl">
          Projenizin DNA'sını keşfedin. Teknoloji yığınını analiz edin, 
          mimariyi haritalayın ve çalışma akışlarını görün.
        </p>
      </div>

      {/* Control Panel */}
      <section className="glass-card p-8 mb-12 animate-fade-in">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
          <div className="flex-1 w-full space-y-2">
            <label className="text-sm font-medium text-zinc-500 ml-1">Proje Dizini (Absolute Path)</label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="C:\Projects\my-awesome-app"
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
          </div>
          <button 
            onClick={handleScan}
            disabled={loading}
            className="btn-primary flex items-center gap-2 mt-7 min-w-[140px] justify-center"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Network className="w-5 h-5" />}
            {loading ? 'Analiz Ediliyor...' : 'Taramayı Başlat'}
          </button>
        </div>
        {error && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}
      </section>

      {/* Results Section */}
      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in">
          {/* Summary Cards */}
          <div className="lg:col-span-4 space-y-6">
            <div className="glass-card p-6 border-l-4 border-l-[#00ff88]">
              <div className="flex items-center gap-3 mb-4">
                <Cpu className="w-5 h-5 text-[#00ff88]" />
                <h3 className="font-bold text-lg">Teknoloji Yığını</h3>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                {result.techStack.length > 0 ? result.techStack.map((tech: string) => (
                  <span key={tech} className="px-3 py-1 bg-white/5 rounded-full border border-white/10">
                    {tech}
                  </span>
                )) : <span className="text-zinc-500">Tespit edilemedi</span>}
              </div>
            </div>

            <div className="glass-card p-6 border-l-4 border-l-[#00d4ff]">
              <div className="flex items-center gap-3 mb-4">
                <LayoutIcon className="w-5 h-5 text-[#00d4ff]" />
                <h3 className="font-bold text-lg">Mimari Taslak</h3>
              </div>
              <p className="text-zinc-400 text-sm leading-relaxed">
                {result.architecture}
              </p>
            </div>

            <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Files className="w-5 h-5 text-zinc-400" />
                  <h3 className="font-bold text-lg">Proje İstatistikleri</h3>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white/5 rounded-xl text-center">
                  <div className="text-2xl font-bold">{result.stats.files}</div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wider">Dosya</div>
                </div>
                <div className="p-4 bg-white/5 rounded-xl text-center">
                  <div className="text-2xl font-bold">{result.stats.folders}</div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wider">Klasör</div>
                </div>
              </div>
            </div>

            <button 
              onClick={downloadReport}
              className="btn-secondary w-full flex items-center justify-center gap-2 hover:border-[#00ff88]/50"
            >
              <Download className="w-5 h-5" />
              Analiz Raporunu İndir (.TXT)
            </button>
          </div>

          {/* Diagram Section */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            <div className="glass-card p-8 flex-1 min-h-[500px]">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Network className="w-6 h-6 text-[#00ff88]" />
                  <h3 className="text-xl font-bold">Proje Akış Diyagramı</h3>
                </div>
                <div className="text-xs px-3 py-1 bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20 rounded-full font-medium">
                  Mermaid Engine
                </div>
              </div>
              <Mermaid chart={result.flowDiagram} />
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!result && !loading && (
        <div className="flex flex-col items-center justify-center py-20 opacity-30 select-none">
          <AlertCircle className="w-16 h-16 mb-4" />
          <p className="text-xl font-medium tracking-wide">Analiz bekleniyor...</p>
        </div>
      )}
    </main>
  );
}
