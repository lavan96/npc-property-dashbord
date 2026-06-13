/**
 * Quick PDF-import engine switcher for the Template Builder header.
 *
 * Writes through to the same `localStorage.lovable.pdf_import.engine` override
 * that `resolvePdfImportEngine` reads, so the choice applies to the Import PDF
 * dialog (and any other caller) without needing to open it first.
 */
import { useEffect, useState } from 'react';
import { Cpu, Zap, Sparkles } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  invalidatePdfImportEngineCache,
  resolvePdfImportEngine,
  type PdfImportEngine,
} from '@/lib/featureFlags/pdfImportEngine';
import { useAuth } from '@/hooks/useAuth';

const LS_KEY = 'lovable.pdf_import.engine';
type Choice = 'auto' | PdfImportEngine;

function readChoice(): Choice {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v === 'legacy' || v === 'docling') return v;
  } catch { /* ignore */ }
  return 'auto';
}

export function PdfImportEngineToggle() {
  const { user, isSuperadmin } = useAuth();
  const [choice, setChoice] = useState<Choice>('auto');
  const [resolved, setResolved] = useState<PdfImportEngine>('legacy');

  useEffect(() => { setChoice(readChoice()); }, []);

  useEffect(() => {
    let cancelled = false;
    resolvePdfImportEngine({ userId: user?.id ?? null, isSuperadmin })
      .then((e) => { if (!cancelled) setResolved(e); })
      .catch(() => { if (!cancelled) setResolved('legacy'); });
    return () => { cancelled = true; };
  }, [user?.id, isSuperadmin, choice]);

  const onChange = (v: Choice) => {
    setChoice(v);
    try {
      if (v === 'auto') localStorage.removeItem(LS_KEY);
      else localStorage.setItem(LS_KEY, v);
    } catch { /* ignore */ }
    invalidatePdfImportEngineCache();
  };

  const effective: PdfImportEngine = choice === 'auto' ? resolved : choice;

  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1">
      <div className="flex items-center gap-1.5 text-xs">
        {effective === 'docling' ? (
          <Zap className="h-3.5 w-3.5 text-primary" />
        ) : (
          <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="text-muted-foreground hidden sm:inline">PDF engine</span>
        <Badge
          variant={effective === 'docling' ? 'default' : 'secondary'}
          className="text-[10px] h-5"
        >
          {effective === 'docling' ? 'Docling' : 'Legacy'}
        </Badge>
      </div>
      <Select value={choice} onValueChange={(v) => onChange(v as Choice)}>
        <SelectTrigger className="h-7 w-[140px] text-xs border-0 bg-transparent shadow-none focus:ring-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" /> Auto ({resolved})
            </span>
          </SelectItem>
          <SelectItem value="legacy">
            <span className="flex items-center gap-1.5">
              <Cpu className="h-3 w-3" /> Legacy (pdf.js)
            </span>
          </SelectItem>
          <SelectItem value="docling">
            <span className="flex items-center gap-1.5">
              <Zap className="h-3 w-3" /> Docling (cloud)
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
