"use client";
import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 p-6 lg:p-12 font-sans text-slate-900 flex items-center justify-center">
      <div className="max-w-7xl mx-auto w-full space-y-12">
        <div className="text-center">
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-slate-900 flex items-center justify-center gap-4 mb-6">
            <span className="bg-gradient-to-br from-indigo-500 to-purple-600 bg-clip-text text-transparent">Antigravity</span>
            Dashboard
          </h1>
          <p className="text-xl text-slate-500 max-w-2xl mx-auto font-medium">Select a module to manage your automated affiliate marketing pipeline.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
          
          <Link href="/poster" className="group relative bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 hover:border-indigo-300 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:shadow-indigo-200 overflow-hidden flex flex-col items-center text-center">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-indigo-500"></div>
            <div className="w-20 h-20 rounded-2xl bg-indigo-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-inner">
              <span className="text-4xl">📅</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-3">Auto-Poster Schedule</h2>
            <p className="text-slate-500 font-medium leading-relaxed text-sm">Schedule your generated videos to automatically post to YouTube, Instagram, and Facebook.</p>
          </Link>

          <Link href="/studio" className="group relative bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 hover:border-purple-300 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:shadow-purple-200 overflow-hidden flex flex-col items-center text-center">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-400 to-pink-500"></div>
            <div className="w-20 h-20 rounded-2xl bg-purple-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-inner">
              <span className="text-4xl">✨</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-3">AI Content Studio</h2>
            <p className="text-slate-500 font-medium leading-relaxed text-sm">Autonomously generate cinematic AI prompts and videos for your products via Google Flow.</p>
          </Link>

          <Link href="/database" className="group relative bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 hover:border-emerald-300 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:shadow-emerald-200 overflow-hidden flex flex-col items-center text-center">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-teal-500"></div>
            <div className="w-20 h-20 rounded-2xl bg-emerald-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-inner">
              <span className="text-4xl">🗄️</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-3">Health & Database</h2>
            <p className="text-slate-500 font-medium leading-relaxed text-sm">Monitor your local connection, run automated scraping bots, and manage the product database.</p>
          </Link>

        </div>
      </div>
    </main>
  );
}
