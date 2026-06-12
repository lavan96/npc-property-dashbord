/**
 * usePdfImportJob — start an async Docling PDF parse job and stream progress.
 *
 * Pairs with the `pdf-parse-dispatch` edge function and the `pdf_import_jobs`
 * table (Realtime-enabled). Returns the current job row and helpers, so the
 * UI can render staged progress and final results without polling.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeSecureFunction } from '@/lib/secureInvoke';

export type PdfImportMode = 'semantic' | 'hybrid' | 'pixel-perfect';

export interface PdfImportJobRow {
  id: string;
  status: 'queued' | 'parsing' | 'rastering' | 'finalizing' | 'parsed' | 'failed' | string;
  stage: string | null;
  mode: PdfImportMode | string;
  page_count: number | null;
  duration_ms: number | null;
  ssim_score: number | null;
  error_code: string | null;
  error_text: string | null;
  diagnostics_path: string | null;
  result_payload: Record<string, unknown> | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface StartPdfImportInput {
  mode?: PdfImportMode;
  /** Pre-signed URL the sidecar can fetch directly (preferred). */
  sourceUrl?: string;
  /** Storage path (within `template-import-assets` unless `sourceBucket` set). */
  sourcePath?: string;
  sourceBucket?: string;
  /** Raw base64 PDF (fallback — uploaded to the diagnostics bucket). */
  sourceBase64?: string;
  templateId?: string | null;
  sourceFileName?: string;
  sourceFileSizeBytes?: number;
}

export interface UsePdfImportJobResult {
  job: PdfImportJobRow | null;
  jobId: string | null;
  isStarting: boolean;
  error: string | null;
  start: (input: StartPdfImportInput) => Promise<string | null>;
  reset: () => void;
}

const TERMINAL = new Set(['parsed', 'failed']);

export function usePdfImportJob(): UsePdfImportJobResult {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<PdfImportJobRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const cleanupChannel = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  // Realtime subscription for the active job.
  useEffect(() => {
    if (!jobId) return;
    cleanupChannel();
    const channel = supabase
      .channel(`pdf_import_jobs:${jobId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pdf_import_jobs', filter: `id=eq.${jobId}` },
        (payload) => setJob(payload.new as PdfImportJobRow),
      )
      .subscribe();
    channelRef.current = channel;

    // Seed initial row + a safety poll in case realtime misses the first update.
    let cancelled = false;
    const fetchRow = async () => {
      const { data } = await supabase
        .from('pdf_import_jobs')
        .select('id,status,stage,mode,page_count,duration_ms,ssim_score,error_code,error_text,diagnostics_path,result_payload,started_at,finished_at')
        .eq('id', jobId)
        .single();
      if (!cancelled && data) setJob(data as PdfImportJobRow);
    };
    fetchRow();
    const poll = setInterval(() => {
      if (job && TERMINAL.has(job.status)) return;
      fetchRow();
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(poll);
      cleanupChannel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const start = useCallback(async (input: StartPdfImportInput): Promise<string | null> => {
    setError(null);
    setIsStarting(true);
    try {
      const { data, error: invokeErr } = await invokeSecureFunction('pdf-parse-dispatch', {
        operation: 'start',
        mode: input.mode ?? 'semantic',
        source_url: input.sourceUrl,
        source_path: input.sourcePath,
        source_bucket: input.sourceBucket,
        source_base64: input.sourceBase64,
        template_id: input.templateId ?? null,
        source_file_name: input.sourceFileName,
        source_file_size_bytes: input.sourceFileSizeBytes,
      });
      if (invokeErr) throw new Error(invokeErr.message);
      const id = (data as { job_id?: string } | null)?.job_id ?? null;
      if (!id) throw new Error('dispatcher returned no job id');
      setJobId(id);
      setJob(null);
      return id;
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
      return null;
    } finally {
      setIsStarting(false);
    }
  }, []);

  const reset = useCallback(() => {
    cleanupChannel();
    setJobId(null);
    setJob(null);
    setError(null);
    setIsStarting(false);
  }, [cleanupChannel]);

  return { job, jobId, isStarting, error, start, reset };
}
