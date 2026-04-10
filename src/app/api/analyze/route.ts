import { NextRequest, NextResponse } from 'next/server';
import { analyzeProject } from '@/lib/analyzer';

export async function POST(req: NextRequest) {
  try {
    const { path: directoryPath } = await req.json();

    if (!directoryPath) {
      return NextResponse.json({ error: 'Directory path is required' }, { status: 400 });
    }

    const analysis = await analyzeProject(directoryPath);

    return NextResponse.json(analysis);
  } catch (error: any) {
    console.error('Analysis error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
