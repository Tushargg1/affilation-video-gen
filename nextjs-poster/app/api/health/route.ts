import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const customBackendUrl = searchParams.get('backendUrl') || process.env.RENDER_BACKEND_URL || 'https://data-scrapper-n7ua.onrender.com';

  const result: any = {
    timestamp: new Date().toISOString(),
    database: {
      provider: 'Supabase (PostgreSQL)',
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || 'Not configured',
      status: 'unknown',
      latencyMs: 0,
      totalCount: 0,
      message: '',
    },
    backend: null,
  };

  // 1. Check Supabase
  const dbStart = Date.now();
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      result.database.status = 'unconfigured';
      result.database.message = 'Supabase credentials missing in environment';
    } else {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
      );

      // Lightweight probe with exact count
      const { count, error } = await supabase
        .from('auto_products')
        .select('*', { count: 'exact', head: true });

      result.database.latencyMs = Date.now() - dbStart;

      if (error) {
        const errMsg = error.message || '';
        const isPaused =
          errMsg.includes('fetch failed') ||
          errMsg.includes('ENOTFOUND') ||
          errMsg.includes('53300') ||
          errMsg.includes('tenant') ||
          errMsg.includes('paused');

        result.database.status = isPaused ? 'paused' : 'error';
        result.database.message = isPaused
          ? 'Supabase database is PAUSED due to inactivity. Go to supabase.com/dashboard to resume.'
          : errMsg;
      } else {
        result.database.status = 'online';
        result.database.totalCount = count ?? 0;
        result.database.message = `Active & Operational (${count ?? 0} products stored)`;
      }
    }
  } catch (err: any) {
    result.database.latencyMs = Date.now() - dbStart;
    const errMsg = err?.message || String(err);
    const isPaused =
      errMsg.includes('fetch failed') ||
      errMsg.includes('ENOTFOUND') ||
      errMsg.includes('tenant');

    result.database.status = isPaused ? 'paused' : 'offline';
    result.database.message = isPaused
      ? 'Supabase project is PAUSED (domain offline). Please unpause in Supabase dashboard.'
      : errMsg;
  }

  // 2. Check Render / Custom Backend if provided
  if (customBackendUrl) {
    const backendStart = Date.now();
    try {
      const cleanUrl = customBackendUrl.trim();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(cleanUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': 'HealthCheck/1.0' },
      }).catch((e) => {
        if (e.name === 'AbortError') throw new Error('Timeout (likely cold starting)');
        throw e;
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - backendStart;
      const renderRouting = res.headers.get('x-render-routing');
      const isSuspended = renderRouting === 'suspend-by-user';

      result.backend = {
        url: cleanUrl,
        status: res.ok ? 'online' : (isSuspended ? 'suspended' : `http_${res.status}`),
        httpStatus: res.status,
        latencyMs,
        message: res.ok
          ? 'Online and responding'
          : (isSuspended
              ? 'Suspended on Render. Open dashboard to resume.'
              : `Returned HTTP ${res.status}`),
      };
    } catch (err: any) {
      const latencyMs = Date.now() - backendStart;
      const isColdStart = err?.message?.includes('Timeout');
      result.backend = {
        url: customBackendUrl,
        status: isColdStart ? 'cold_starting' : 'offline',
        latencyMs,
        message: isColdStart
          ? 'Free tier server is spinning up (cold start taking >8s). Try again in a minute.'
          : err?.message || 'Failed to connect to backend',
      };
    }
  }

  return NextResponse.json(result);
}
