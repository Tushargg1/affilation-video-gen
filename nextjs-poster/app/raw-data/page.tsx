'use client';
import { useEffect, useState } from 'react';

export default function RawDataPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/db/products')
      .then(res => res.json())
      .then(d => {
        if (d.products) {
          setData(d.products);
        } else if (Array.isArray(d)) {
          setData(d);
        }
      })
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-black text-slate-800 mb-2">Unidentified Data (Raw DB Inspector)</h1>
        <p className="text-slate-500 mb-8">This page displays the exact raw JSON rows currently stored in your Supabase cloud database. If media is stored in the database but not visible in the UI, it will appear here.</p>
        
        {loading ? (
          <div className="p-8 text-center text-slate-500 font-semibold animate-pulse">Loading database contents...</div>
        ) : (
          <div className="space-y-6">
            {data.map((item, idx) => (
              <div key={item.id || idx} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="bg-slate-900 text-white px-4 py-2 flex justify-between items-center">
                  <span className="font-bold text-sm tracking-widest">ID: {item.id}</span>
                  <span className="text-xs text-slate-400 font-medium truncate ml-4">Title: {item.title || 'N/A'}</span>
                </div>
                <div className="p-4 bg-slate-50 overflow-x-auto">
                  <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap break-all">
                    {JSON.stringify(item, null, 2)}
                  </pre>
                </div>
              </div>
            ))}
            {data.length === 0 && (
              <div className="p-8 bg-white border border-slate-200 rounded-xl text-center text-slate-500 font-medium shadow-sm">
                No products found in the database.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
