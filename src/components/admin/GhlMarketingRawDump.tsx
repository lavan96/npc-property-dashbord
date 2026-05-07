import React, { useEffect, useState } from 'react';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, RefreshCw, FileJson, Code, ExternalLink, Eye, FileArchive, Search } from 'lucide-react';
import { toast } from 'sonner';

interface SummaryRow {
  id: string;
  resource_type: 'form' | 'survey' | 'quiz' | 'funnel' | 'funnel_page' | 'workflow';
  ghl_id: string;
  name: string | null;
  parent_ghl_id: string | null;
  full_url: string | null;
  fetch_status: string;
  fetch_error: string | null;
  last_fetched_at: string;
  has_html: boolean;
  has_raw_html?: boolean;
  has_markdown?: boolean;
  has_css: boolean;
  has_embed: boolean;
  has_screenshot?: boolean;
  has_links?: boolean;
  has_metadata?: boolean;
  has_submissions?: boolean;
  enrichment_sources?: any;
}

const TYPE_COLOR: Record<string, string> = {
  form: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  survey: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  quiz: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
  funnel: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  funnel_page: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  workflow: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
};

export function GhlMarketingRawDump() {
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [dumping, setDumping] = useState(false);
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [detail, setDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const res = await invokeSecureFunction('ghl-marketing-raw-dump', { action: 'list' });
    if (res.error) toast.error(res.error.message);
    else {
      setRows(res.data?.rows || []);
      setCounts(res.data?.counts || {});
    }
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const handleDump = async () => {
    setDumping(true);
    toast.info('Pulling raw data from GHL — this may take 1–2 minutes…');
    const res = await invokeSecureFunction('ghl-marketing-raw-dump', { action: 'dump', account: 'legacy' }, { timeoutMs: 300_000 });
    setDumping(false);
    if (res.error) {
      toast.error(`Dump failed: ${res.error.message}`);
      return;
    }
    const d = res.data || {};
    toast.success(`Dump complete — ${d.inserted || 0} records (${Object.entries(d.breakdown || {}).map(([k, v]) => `${k}:${v}`).join(', ')})`);
    if ((d.errors || []).length) console.warn('[dump errors]', d.errors);
    refresh();
  };

  const handleExportAll = async () => {
    toast.info('Preparing full export…');
    const res = await invokeSecureFunction('ghl-marketing-raw-dump', { action: 'export' }, { timeoutMs: 120_000 });
    if (res.error) { toast.error(res.error.message); return; }
    const rows = res.data?.rows || [];
    // Build a single ZIP-like JSON bundle (download as one .json) plus per-resource HTML/CSS files.
    const bundle = { exported_at: new Date().toISOString(), count: rows.length, rows };
    download(`ghl-raw-dump-${stamp()}.json`, JSON.stringify(bundle, null, 2), 'application/json');
    toast.success(`Exported ${rows.length} records`);
  };

  const openDetail = async (row: SummaryRow) => {
    setDetail({ loading: true, summary: row });
    setDetailLoading(true);
    const res = await invokeSecureFunction('ghl-marketing-raw-dump', { action: 'export' }, { timeoutMs: 60_000 });
    setDetailLoading(false);
    if (res.error) { toast.error(res.error.message); setDetail(null); return; }
    const full = (res.data?.rows || []).find((r: any) => r.id === row.id);
    setDetail({ summary: row, full });
  };

  const filtered = rows.filter((r) => {
    if (typeFilter !== 'all' && r.resource_type !== typeFilter) return false;
    if (filter && !(`${r.name || ''} ${r.ghl_id}`).toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  return (
    <Card className="border-border/60">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileArchive className="h-5 w-5 text-primary" />
              Raw Marketing-Asset Dump
            </CardTitle>
            <CardDescription className="mt-1">
              Pulls every byte the GHL API exposes for forms, surveys, quizzes, funnels, funnel pages and workflows
              (raw JSON, HTML, CSS, embed code). Use this as the manual rebuild reference for the new account.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={handleDump} disabled={dumping} size="sm">
              <RefreshCw className={`h-4 w-4 mr-2 ${dumping ? 'animate-spin' : ''}`} />
              {dumping ? 'Pulling from GHL…' : 'Pull fresh dump from GHL'}
            </Button>
            <Button onClick={handleExportAll} variant="default" size="sm" disabled={rows.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export all (.json)
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-primary/30 bg-primary/5">
          <FileJson className="h-4 w-4 text-primary" />
          <AlertTitle>How to use</AlertTitle>
          <AlertDescription className="text-xs">
            1. Click <b>Pull fresh dump</b> to fetch raw data from the legacy account.
            2. Click any row to view raw JSON / HTML / CSS / embed code.
            3. Use <b>Export all</b> to download everything as a single JSON bundle for offline reference while rebuilding.
          </AlertDescription>
        </Alert>

        {/* Counts */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={typeFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTypeFilter('all')}
          >
            All ({rows.length})
          </Button>
          {Object.entries(counts).map(([type, count]) => (
            <Button
              key={type}
              variant={typeFilter === type ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTypeFilter(type)}
            >
              <Badge variant="outline" className={`mr-2 ${TYPE_COLOR[type] || ''}`}>{type}</Badge>
              {count}
            </Button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or GHL ID…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-9"
          />
        </div>

        <ScrollArea className="h-[500px] border border-border/40 rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Type</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-28">Captured</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                    {rows.length === 0 ? 'No data yet — click "Pull fresh dump from GHL" to begin.' : 'No matches.'}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((r) => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openDetail(r)}>
                  <TableCell>
                    <Badge variant="outline" className={TYPE_COLOR[r.resource_type] || ''}>
                      {r.resource_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{r.name || <span className="text-muted-foreground">Unnamed</span>}</div>
                    <div className="text-xs text-muted-foreground font-mono">{r.ghl_id}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-[10px]">JSON</Badge>
                      {r.has_html && <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400">HTML</Badge>}
                      {r.has_css && <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400">CSS</Badge>}
                      {r.has_embed && <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400">Embed</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.fetch_status === 'ok' ? 'default' : 'secondary'} className="text-[10px]">
                      {r.fetch_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.full_url && (
                      <Button
                        variant="ghost" size="sm"
                        onClick={(e) => { e.stopPropagation(); window.open(r.full_url!, '_blank'); }}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openDetail(r); }}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detail?.summary && (
                <Badge variant="outline" className={TYPE_COLOR[detail.summary.resource_type] || ''}>
                  {detail.summary.resource_type}
                </Badge>
              )}
              {detail?.summary?.name || detail?.summary?.ghl_id}
            </DialogTitle>
          </DialogHeader>
          {detailLoading || !detail?.full ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />
              Loading raw data…
            </div>
          ) : (
            <Tabs defaultValue="json" className="flex-1 flex flex-col overflow-hidden">
              <TabsList>
                <TabsTrigger value="json"><FileJson className="h-3.5 w-3.5 mr-1" />JSON</TabsTrigger>
                <TabsTrigger value="html" disabled={!detail.full.html_content}><Code className="h-3.5 w-3.5 mr-1" />HTML</TabsTrigger>
                <TabsTrigger value="css" disabled={!detail.full.css_content}>CSS</TabsTrigger>
                <TabsTrigger value="embed" disabled={!detail.full.embed_code}>Embed</TabsTrigger>
                <TabsTrigger value="meta">Endpoints</TabsTrigger>
              </TabsList>
              <TabsContent value="json" className="flex-1 overflow-hidden mt-2">
                <div className="flex justify-end mb-2">
                  <Button size="sm" variant="outline" onClick={() => download(`${detail.summary.resource_type}-${detail.summary.ghl_id}.json`, JSON.stringify(detail.full.raw_payload, null, 2), 'application/json')}>
                    <Download className="h-3.5 w-3.5 mr-1" /> Download JSON
                  </Button>
                </div>
                <ScrollArea className="h-full border border-border/40 rounded-md">
                  <pre className="text-[11px] p-3 font-mono whitespace-pre-wrap break-all">
                    {JSON.stringify(detail.full.raw_payload, null, 2)}
                  </pre>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="html" className="flex-1 overflow-hidden mt-2">
                <div className="flex justify-end mb-2">
                  <Button size="sm" variant="outline" onClick={() => download(`${detail.summary.resource_type}-${detail.summary.ghl_id}.html`, detail.full.html_content || '', 'text/html')}>
                    <Download className="h-3.5 w-3.5 mr-1" /> Download HTML
                  </Button>
                </div>
                <ScrollArea className="h-full border border-border/40 rounded-md">
                  <pre className="text-[11px] p-3 font-mono whitespace-pre-wrap break-all">{detail.full.html_content}</pre>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="css" className="flex-1 overflow-hidden mt-2">
                <div className="flex justify-end mb-2">
                  <Button size="sm" variant="outline" onClick={() => download(`${detail.summary.resource_type}-${detail.summary.ghl_id}.css`, detail.full.css_content || '', 'text/css')}>
                    <Download className="h-3.5 w-3.5 mr-1" /> Download CSS
                  </Button>
                </div>
                <ScrollArea className="h-full border border-border/40 rounded-md">
                  <pre className="text-[11px] p-3 font-mono whitespace-pre-wrap break-all">{detail.full.css_content}</pre>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="embed" className="flex-1 overflow-hidden mt-2">
                <ScrollArea className="h-full border border-border/40 rounded-md">
                  <pre className="text-[11px] p-3 font-mono whitespace-pre-wrap break-all">{detail.full.embed_code}</pre>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="meta" className="flex-1 overflow-hidden mt-2">
                <ScrollArea className="h-full border border-border/40 rounded-md">
                  <pre className="text-[11px] p-3 font-mono whitespace-pre-wrap break-all">
                    {JSON.stringify({
                      endpoints_tried: detail.full.endpoints_tried,
                      fetch_status: detail.full.fetch_status,
                      fetch_error: detail.full.fetch_error,
                      last_fetched_at: detail.full.last_fetched_at,
                      full_url: detail.full.full_url,
                      parent_ghl_id: detail.full.parent_ghl_id,
                    }, null, 2)}
                  </pre>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
}
