'use client';

import { useState, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { ReelEditorState, AspectRatio, OverlayPosition, OverlaySize } from './types';

export default function ReelEditorClient() {
  const [state, setState] = useState<ReelEditorState>({
    clip1Url: '',
    clip2Url: '',
    audioUrl: '',
    imageUrl: '',
    aspectRatio: '9:16',
    overlayPosition: 'bottom-right',
    overlaySize: 'medium',
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [uploadedBlobUrl, setUploadedBlobUrl] = useState<string | null>(null);

  const ffmpegRef = useRef(new FFmpeg());

  const handleInputChange = (field: keyof ReelEditorState, value: string) => {
    setState((prev) => ({ ...prev, [field]: value }));
  };

  const getResolution = (ratio: AspectRatio) => {
    switch (ratio) {
      case '9:16': return { w: 1080, h: 1920 };
      case '1:1': return { w: 1080, h: 1080 };
      case '16:9': return { w: 1920, h: 1080 };
    }
  };

  const getOverlayExpr = (position: OverlayPosition) => {
    switch (position) {
      case 'bottom-right': return 'x=main_w-overlay_w-20:y=main_h-overlay_h-20';
      case 'bottom-left': return 'x=20:y=main_h-overlay_h-20';
      case 'top-right': return 'x=main_w-overlay_w-20:y=20';
      case 'top-left': return 'x=20:y=20';
      case 'center': return 'x=(main_w-overlay_w)/2:y=(main_h-overlay_h)/2';
    }
  };

  const getOverlaySizeExpr = (size: OverlaySize) => {
    switch (size) {
      case 'small': return 'iw*0.15:-1';
      case 'medium': return 'iw*0.25:-1';
      case 'large': return 'iw*0.40:-1';
    }
  };

  const processVideo = async () => {
    if (!state.clip1Url || !state.clip2Url || !state.audioUrl || !state.imageUrl) {
      alert('Please provide all URLs');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setMessage('Loading FFmpeg...');
    setResultUrl(null);
    setUploadedBlobUrl(null);

    try {
      const ffmpeg = ffmpegRef.current;
      
      ffmpeg.on('progress', ({ progress }) => {
        setProgress(Math.round(progress * 100));
      });

      if (!ffmpeg.loaded) {
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
      }

      setMessage('Downloading files...');
      
      await ffmpeg.writeFile('clip1.mp4', await fetchFile(state.clip1Url));
      await ffmpeg.writeFile('clip2.mp4', await fetchFile(state.clip2Url));
      await ffmpeg.writeFile('audio.mp3', await fetchFile(state.audioUrl));
      await ffmpeg.writeFile('overlay.png', await fetchFile(state.imageUrl));

      const { w, h } = getResolution(state.aspectRatio);
      const overlayPos = getOverlayExpr(state.overlayPosition);
      const overlaySize = getOverlaySizeExpr(state.overlaySize);

      setMessage('Processing video (this may take a while)...');

      const filterComplex = `
        [0:v]trim=0:10,setpts=PTS-STARTPTS,scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fade=t=in:st=0:d=0.5[v0];
        [1:v]trim=0:10,setpts=PTS-STARTPTS,scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fade=t=out:st=9.5:d=0.5[v1];
        [v0][v1]concat=n=2:v=1:a=0[concatv];
        [3:v]scale=${overlaySize}[img];
        [concatv][img]overlay=${overlayPos}[outv];
        [2:a]atrim=0:20,asetpts=PTS-STARTPTS[outa]
      `.replace(/\s+/g, '');

      await ffmpeg.exec([
        '-i', 'clip1.mp4',
        '-i', 'clip2.mp4',
        '-i', 'audio.mp3',
        '-i', 'overlay.png',
        '-filter_complex', filterComplex,
        '-map', '[outv]',
        '-map', '[outa]',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-c:a', 'aac',
        '-t', '20',
        'output.mp4'
      ]);

      setMessage('Finalizing...');
      const data = await ffmpeg.readFile('output.mp4');
      const blob = new Blob([data], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      
      setMessage('Uploading to Vercel Blob...');
      const formData = new FormData();
      formData.append('file', blob, 'reel.mp4');
      
      const uploadRes = await fetch('/api/upload-reel', {
        method: 'POST',
        body: formData,
      });
      
      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        setUploadedBlobUrl(uploadData.url);
        setMessage('Done! Video processed and uploaded.');
      } else {
        setMessage('Done! (Failed to upload to Blob storage)');
      }

    } catch (err) {
      console.error(err);
      setMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-7 bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-slate-900">
          <svg className="w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Input Media
        </h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Clip 1 URL (First 10s)</label>
            <input 
              type="text" 
              value={state.clip1Url}
              onChange={(e) => handleInputChange('clip1Url', e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50" 
              placeholder="https://..." 
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Clip 2 URL (Next 10s)</label>
            <input 
              type="text" 
              value={state.clip2Url}
              onChange={(e) => handleInputChange('clip2Url', e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50" 
              placeholder="https://..." 
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Audio URL (Background Track)</label>
            <input 
              type="text" 
              value={state.audioUrl}
              onChange={(e) => handleInputChange('audioUrl', e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50" 
              placeholder="https://..." 
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Image URL (Watermark/Overlay)</label>
            <input 
              type="text" 
              value={state.imageUrl}
              onChange={(e) => handleInputChange('imageUrl', e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50" 
              placeholder="https://..." 
            />
          </div>
        </div>

        <h2 className="text-2xl font-bold mb-4 mt-8 flex items-center gap-2 text-slate-900">
          <svg className="w-6 h-6 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          Settings
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Aspect Ratio</label>
            <div className="flex gap-2">
              {(['9:16', '1:1', '16:9'] as AspectRatio[]).map((ratio) => (
                <button
                  key={ratio}
                  onClick={() => handleInputChange('aspectRatio', ratio)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border-2 ${
                    state.aspectRatio === ratio 
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700' 
                      : 'border-slate-200 hover:border-indigo-300 text-slate-600'
                  }`}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Overlay Size</label>
            <div className="flex gap-2">
              {(['small', 'medium', 'large'] as OverlaySize[]).map((size) => (
                <button
                  key={size}
                  onClick={() => handleInputChange('overlaySize', size)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border-2 capitalize ${
                    state.overlaySize === size 
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700' 
                      : 'border-slate-200 hover:border-indigo-300 text-slate-600'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Overlay Position</label>
            <div className="grid grid-cols-3 gap-2 w-48">
              <button onClick={() => handleInputChange('overlayPosition', 'top-left')} className={`aspect-square rounded-lg border-2 ${state.overlayPosition === 'top-left' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200'}`}></button>
              <button disabled className="aspect-square rounded-lg border border-slate-100 bg-slate-50 opacity-50"></button>
              <button onClick={() => handleInputChange('overlayPosition', 'top-right')} className={`aspect-square rounded-lg border-2 ${state.overlayPosition === 'top-right' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200'}`}></button>
              <button disabled className="aspect-square rounded-lg border border-slate-100 bg-slate-50 opacity-50"></button>
              <button onClick={() => handleInputChange('overlayPosition', 'center')} className={`aspect-square rounded-lg border-2 flex items-center justify-center ${state.overlayPosition === 'center' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200'}`}>
                <span className="w-3 h-3 rounded-full bg-slate-400"></span>
              </button>
              <button disabled className="aspect-square rounded-lg border border-slate-100 bg-slate-50 opacity-50"></button>
              <button onClick={() => handleInputChange('overlayPosition', 'bottom-left')} className={`aspect-square rounded-lg border-2 ${state.overlayPosition === 'bottom-left' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200'}`}></button>
              <button disabled className="aspect-square rounded-lg border border-slate-100 bg-slate-50 opacity-50"></button>
              <button onClick={() => handleInputChange('overlayPosition', 'bottom-right')} className={`aspect-square rounded-lg border-2 ${state.overlayPosition === 'bottom-right' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200'}`}></button>
            </div>
          </div>
        </div>

        <button 
          onClick={processVideo}
          disabled={isProcessing}
          className="mt-8 w-full py-4 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all font-bold shadow-lg shadow-indigo-200 flex justify-center items-center gap-2"
        >
          {isProcessing ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing... {progress}%
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Generate Reel
            </>
          )}
        </button>

        {message && (
          <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 text-center">
            {message}
          </div>
        )}
      </div>

      <div className="lg:col-span-5 bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col items-center">
        <h2 className="text-2xl font-bold mb-6 w-full text-left text-slate-900">Result</h2>
        
        {resultUrl ? (
          <div className="w-full flex flex-col items-center gap-4">
            <video 
              src={resultUrl} 
              controls 
              className="max-w-full max-h-[500px] rounded-xl border border-slate-200 bg-black"
            />
            
            <a 
              href={resultUrl} 
              download="reel.mp4"
              className="w-full py-3 text-center bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
            >
              Download Local Copy
            </a>

            {uploadedBlobUrl && (
              <div className="w-full p-4 bg-green-50 border border-green-200 rounded-xl">
                <p className="text-sm font-semibold text-green-800 mb-2">Uploaded to Vercel Blob!</p>
                <input 
                  type="text" 
                  readOnly 
                  value={uploadedBlobUrl}
                  className="w-full px-3 py-2 bg-white border border-green-300 rounded-lg text-sm"
                  onClick={(e) => e.currentTarget.select()}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 w-full border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center min-h-[400px] text-slate-400">
            <svg className="w-16 h-16 opacity-20 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p className="font-medium">Video preview will appear here</p>
          </div>
        )}
      </div>
    </div>
  );
}
