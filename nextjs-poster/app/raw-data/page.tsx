'use client';
import { useEffect, useState } from 'react';

export default function RawDataPage() {
  const [data, setData] = useState<any[]>([]);
  const [blobs, setBlobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingBlobs, setLoadingBlobs] = useState(true);

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

    fetch('/api/vercel-blobs')
      .then(res => res.json())
      .then(d => {
        if (d.blobs) setBlobs(d.blobs);
      })
      .catch(e => console.error(e))
      .finally(() => setLoadingBlobs(false));
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

        <div className="mt-16">
          <h2 className="text-2xl font-black text-slate-800 mb-2">Vercel Blob Storage</h2>
          <p className="text-slate-500 mb-8">All generated images and videos that have been successfully uploaded to your Vercel cloud storage.</p>
          
          {loadingBlobs ? (
            <div className="p-8 text-center text-slate-500 font-semibold animate-pulse">Loading Vercel blobs...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {blobs.map((blob, idx) => (
                <div key={blob.url || idx} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
                  {blob.url.match(/\.(mp4|webm)$/i) ? (
                    <video src={blob.url} controls className="w-full h-48 object-cover bg-slate-900" />
                  ) : (
                    <img src={blob.url} alt={blob.pathname} className="w-full h-48 object-cover bg-slate-100" />
                  )}
                  <div className="p-4 flex flex-col gap-1 text-sm bg-slate-50 flex-1">
                    <span className="font-bold text-slate-700 truncate" title={blob.pathname}>{blob.pathname}</span>
                    <span className="text-xs font-mono text-slate-500 truncate" title={blob.url}>
                      <a href={blob.url} target="_blank" rel="noreferrer" className="text-indigo-500 hover:underline">{blob.url}</a>
                    </span>
                    <div className="flex justify-between items-center mt-2 text-xs text-slate-400 font-semibold">
                      <span>{(blob.size / 1024 / 1024).toFixed(2)} MB</span>
                      <span>{new Date(blob.uploadedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))}
              {blobs.length === 0 && (
                <div className="p-8 bg-white border border-slate-200 rounded-xl text-center text-slate-500 font-medium shadow-sm col-span-full">
                  No files found in Vercel Blob storage.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
