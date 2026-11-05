import ReelEditorClient from './ReelEditorClient';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reel Editor - Antigravity Auto-Poster',
  description: 'Edit and generate reels in the browser using FFmpeg WASM',
};

export default function ReelEditorPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-6 lg:p-12 font-sans text-slate-900">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="text-center md:text-left md:flex md:items-center md:justify-between">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 flex items-center justify-center md:justify-start gap-3">
              <span className="bg-gradient-to-br from-indigo-500 to-purple-600 bg-clip-text text-transparent">Antigravity</span> Reel Editor
            </h1>
            <p className="mt-2 text-lg text-slate-500">Combine clips, add audio, and watermark directly in your browser.</p>
          </div>
        </div>
        <ReelEditorClient />
      </div>
    </main>
  );
}
