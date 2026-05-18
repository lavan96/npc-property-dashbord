import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Library, Search, Loader2, Check, Filter, Clock, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ClientSearchSelect } from '@/components/ui/ClientSearchSelect';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const RECENT_KEY = 'report-qa::recent-library-ids';
const MAX_RECENT = 12;

export interface PickedReport {
  name: string;
  content: string;
  reportId: string;
  propertyAddress: string;
}

interface LibraryRow {
  id: string;
  property_address: string | null;
  report_content: string | null;
  report_tier: string | null;
  report_scope: string | null;
  created_at: string;
  is_client_report: boolean | null;
  client_property_id: string | null;
  status: string | null;
}

interface Props {
  onAdd: (reports: PickedReport[]) => void;
  existingNames?: string[];
  disabled?: boolean;
  className?: string;
}

function loadRecentIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveRecentIds(ids: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, MAX_RECENT)));
  } catch {
    /* ignore */
  }
}

export function ReportLibraryPicker({ onAdd, existingNames = [], disabled, className }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<LibraryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [clientId, setClientId] = useState<string | undefined>(undefined);
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'recent'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [clientPropertyIds, setClientPropertyIds] = useState<string[] | null>(null);

  useEffect(() => {
    if (open) setRecentIds(loadRecentIds());
  }, [open]);

  // Resolve client → property IDs filter
  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      if (!clientId) {
        setClientPropertyIds(null);
        return;
      }
      const { data, error } = await supabase
        .from('client_properties')
        .select('id')
        .eq('client_id', clientId);
      if (cancelled) return;
      if (error) {
        console.error('[ReportLibraryPicker] client_properties fetch failed', error);
        setClientPropertyIds([]);
        return;
      }
      setClientPropertyIds((data ?? []).map((r: any) => r.id));
    }
    resolve();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('investment_reports')
        .select('id, property_address, report_content, report_tier, report_scope, created_at, is_client_report, client_property_id, status')
        .eq('is_archived', false)
        .not('report_content', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200);

      if (clientPropertyIds && clientPropertyIds.length > 0) {
        query = query.in('client_property_id', clientPropertyIds);
      } else if (clientId && clientPropertyIds && clientPropertyIds.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const { data, error } = await query;
      if (error) throw error;
      setRows((data ?? []) as LibraryRow[]);
    } catch (e) {
      console.error('[ReportLibraryPicker] fetch failed', e);
      toast({
        title: 'Failed to load library',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [clientId, clientPropertyIds, toast]);

  useEffect(() => {
    if (open) fetchRows();
  }, [open, fetchRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;
    if (scopeFilter === 'recent') {
      const set = new Set(recentIds);
      list = list.filter((r) => set.has(r.id));
    }
    if (tierFilter !== 'all') {
      list = list.filter((r) => (r.report_tier ?? '').toLowerCase() === tierFilter);
    }
    if (q) {
      list = list.filter((r) =>
        (r.property_address ?? '').toLowerCase().includes(q) ||
        (r.report_tier ?? '').toLowerCase().includes(q) ||
        (r.report_scope ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, search, tierFilter, scopeFilter, recentIds]);

  const tiers = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.report_tier && set.add(r.report_tier.toLowerCase()));
    return Array.from(set).sort();
  }, [rows]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filtered.map((r) => r.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const buildName = (r: LibraryRow) => {
    const addr = (r.property_address ?? 'Untitled Report').replace(/\s+/g, ' ').trim();
    const tier = r.report_tier ? ` [${r.report_tier}]` : '';
    const date = format(new Date(r.created_at), 'yyyy-MM-dd');
    return `${addr}${tier} (${date}).report`;
  };

  const handleAdd = async () => {
    if (selectedIds.size === 0) return;
    setAdding(true);
    try {
      const picks: PickedReport[] = [];
      const existing = new Set(existingNames);
      for (const id of selectedIds) {
        const row = rows.find((r) => r.id === id);
        if (!row || !row.report_content) continue;
        const name = buildName(row);
        if (existing.has(name)) continue;
        picks.push({
          name,
          content: row.report_content,
          reportId: row.id,
          propertyAddress: row.property_address ?? 'Unknown',
        });
      }
      if (picks.length === 0) {
        toast({
          title: 'Nothing to add',
          description: 'Selected reports are already loaded or have no content.',
        });
        setAdding(false);
        return;
      }
      onAdd(picks);
      // Update recents
      const nextRecent = [
        ...picks.map((p) => p.reportId),
        ...recentIds.filter((id) => !picks.some((p) => p.reportId === id)),
      ].slice(0, MAX_RECENT);
      saveRecentIds(nextRecent);
      setRecentIds(nextRecent);
      toast({
        title: `Added ${picks.length} report${picks.length === 1 ? '' : 's'}`,
        description: 'Loaded from library as conversation context.',
      });
      setSelectedIds(new Set());
      setOpen(false);
    } catch (e) {
      toast({
        title: 'Failed to add reports',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} className={className}>
          <Library className="h-4 w-4 mr-1.5" />
          Pick from library
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Library className="h-5 w-5" />
            Report Library
          </DialogTitle>
          <DialogDescription>
            Search and add existing investment reports as conversation context.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-3 space-y-3 border-b bg-muted/30">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search address, tier, scope…"
                className="pl-8"
              />
            </div>
            <div className="w-full sm:w-64">
              <ClientSearchSelect
                value={clientId ?? null}
                onValueChange={(id) => setClientId(id || undefined)}
                placeholder="All clients"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <button
              type="button"
              onClick={() => setScopeFilter('all')}
              className={cn(
                'px-2 py-1 rounded-md border transition',
                scopeFilter === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
              )}
            >
              <FolderOpen className="h-3 w-3 inline mr-1" />
              All
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter('recent')}
              className={cn(
                'px-2 py-1 rounded-md border transition',
                scopeFilter === 'recent' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
              )}
            >
              <Clock className="h-3 w-3 inline mr-1" />
              Recently used ({recentIds.length})
            </button>
            <div className="h-4 w-px bg-border mx-1" />
            <button
              type="button"
              onClick={() => setTierFilter('all')}
              className={cn(
                'px-2 py-1 rounded-md border transition',
                tierFilter === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
              )}
            >
              All tiers
            </button>
            {tiers.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTierFilter(t)}
                className={cn(
                  'px-2 py-1 rounded-md border transition capitalize',
                  tierFilter === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
                )}
              >
                {t}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-muted-foreground">
                {filtered.length} shown · {selectedIds.size} selected
              </span>
              <Button variant="ghost" size="sm" onClick={selectAllFiltered} disabled={filtered.length === 0}>
                Select all
              </Button>
              <Button variant="ghost" size="sm" onClick={clearSelection} disabled={selectedIds.size === 0}>
                Clear
              </Button>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-3 py-2 space-y-1">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading library…
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                No reports match the current filters.
              </div>
            ) : (
              filtered.map((r) => {
                const checked = selectedIds.has(r.id);
                const isExisting = existingNames.includes(buildName(r));
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggle(r.id)}
                    disabled={isExisting}
                    className={cn(
                      'w-full text-left rounded-md border px-3 py-2.5 flex items-start gap-3 transition',
                      checked ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted',
                      isExisting && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <div
                      className={cn(
                        'mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0',
                        checked ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40'
                      )}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {r.property_address ?? 'Untitled report'}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {r.report_tier && (
                          <Badge variant="secondary" className="capitalize text-[10px] px-1.5 py-0">
                            {r.report_tier}
                          </Badge>
                        )}
                        {r.report_scope && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {r.report_scope}
                          </Badge>
                        )}
                        {r.is_client_report && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            Client
                          </Badge>
                        )}
                        {isExisting && (
                          <Badge className="text-[10px] px-1.5 py-0">Already loaded</Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {format(new Date(r.created_at), 'PP')}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-3 border-t">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={adding}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={selectedIds.size === 0 || adding}>
            {adding ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            Add {selectedIds.size > 0 ? `${selectedIds.size} ` : ''}report{selectedIds.size === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ReportLibraryPicker;
