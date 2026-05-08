import { useEffect, useState, useCallback, useMemo } from 'react';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, UploadCloud, FileText, Trash2, Copy, Download, ExternalLink, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';

const UNASSIGNED = '__unassigned__';

interface LeadMagnet {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  file_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  ghl_pipeline_id: string | null;
  ghl_stage_id: string | null;
  ghl_tag: string | null;
  is_active: boolean;
  download_count: number;
  created_at: string;
}

interface PipelineRow { id: string; ghl_id: string; name: string; }
interface StageRow { id: string; ghl_id: string; pipeline_id: string; name: string; position: number | null; }

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function LeadMagnetsPanel() {
  const [magnets, setMagnets] = useState<LeadMagnet[]>([]);
  const [pipelines, setPipelines] = useState<PipelineRow[]>([]);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [downloadsOpen, setDownloadsOpen] = useState<LeadMagnet | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const [{ data: a }, { data: b }] = await Promise.all([
      invokeSecureFunction('manage-lead-magnets', { operation: 'list' }),
      invokeSecureFunction('manage-lead-magnets', { operation: 'list_pipelines' }),
    ]);
    setMagnets(a?.magnets || []);
    setPipelines(b?.pipelines || []);
    setStages(b?.stages || []);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this lead magnet? This is permanent.')) return;
    const { error } = await invokeSecureFunction('manage-lead-magnets', { operation: 'delete', id });
    if (error) toast.error(error.message); else { toast.success('Deleted'); reload(); }
  };

  const toggleActive = async (m: LeadMagnet) => {
    const { error } = await invokeSecureFunction('manage-lead-magnets', { operation: 'update', id: m.id, is_active: !m.is_active });
    if (error) toast.error(error.message); else reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Lead Magnets</h2>
          <p className="text-sm text-muted-foreground">Gated downloads with capture form & GHL pipeline routing.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New Lead Magnet</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : magnets.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No lead magnets yet. Click "New Lead Magnet" to upload your first.</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {magnets.map(m => {
            const pipeline = pipelines.find(p => p.ghl_id === m.ghl_pipeline_id);
            const stage = stages.find(s => s.ghl_id === m.ghl_stage_id);
            const embedUrl = `${window.location.origin}/lead-magnet-embed.html?slug=${encodeURIComponent(m.slug)}`;
            return (
              <Card key={m.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium">{m.title}</h3>
                        <Badge variant={m.is_active ? 'default' : 'secondary'}>{m.is_active ? 'Active' : 'Disabled'}</Badge>
                        <Badge variant="outline">{m.download_count} downloads</Badge>
                      </div>
                      {m.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{m.description}</p>}
                      <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1">
                        <span>slug: <code>{m.slug}</code></span>
                        <span>file: {m.file_name}</span>
                        {pipeline && <span>Pipeline: {pipeline.name}{stage ? ` → ${stage.name}` : ''}</span>}
                        {m.ghl_tag && <span>Tag: {m.ghl_tag}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch checked={m.is_active} onCheckedChange={() => toggleActive(m)} />
                      <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(embedUrl); toast.success('Embed URL copied'); }}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDownloadsOpen(m)}>
                        <Users className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => window.open(embedUrl, '_blank')}>
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(m.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateLeadMagnetDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { setCreateOpen(false); reload(); }}
        pipelines={pipelines}
        stages={stages}
      />

      <DownloadsDialog magnet={downloadsOpen} onClose={() => setDownloadsOpen(null)} />
    </div>
  );
}

function CreateLeadMagnetDialog({ open, onClose, onCreated, pipelines, stages }: {
  open: boolean; onClose: () => void; onCreated: () => void;
  pipelines: PipelineRow[]; stages: StageRow[];
}) {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [pipelineGhl, setPipelineGhl] = useState<string>(UNASSIGNED);
  const [stageGhl, setStageGhl] = useState<string>(UNASSIGNED);
  const [tag, setTag] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const filteredStages = useMemo(() => {
    if (pipelineGhl === UNASSIGNED) return [];
    const p = pipelines.find(p => p.ghl_id === pipelineGhl);
    if (!p) return [];
    return stages.filter(s => s.pipeline_id === p.id);
  }, [pipelineGhl, pipelines, stages]);

  const reset = () => { setTitle(''); setSlug(''); setDescription(''); setPipelineGhl(UNASSIGNED); setStageGhl(UNASSIGNED); setTag(''); setFile(null); };

  const handleFile = (f: File | null) => {
    if (!f) return;
    if (f.size > 50 * 1024 * 1024) { toast.error('File must be under 50MB'); return; }
    setFile(f);
  };

  const submit = async () => {
    if (!title || !file) { toast.error('Title and file required'); return; }
    setSubmitting(true);
    try {
      const file_data = await fileToBase64(file);
      const { data, error } = await invokeSecureFunction('manage-lead-magnets', {
        operation: 'create',
        title,
        slug: slug || slugify(title),
        description,
        file_data,
        file_name: file.name,
        mime_type: file.type || 'application/pdf',
        ghl_pipeline_id: pipelineGhl === UNASSIGNED ? null : pipelineGhl,
        ghl_stage_id: stageGhl === UNASSIGNED ? null : stageGhl,
        ghl_tag: tag || null,
        is_active: true,
      });
      if (error || data?.error) { toast.error(error?.message || data.error); return; }
      toast.success('Lead magnet created');
      reset();
      onCreated();
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl h-[90vh] flex flex-col">
        <DialogHeader><DialogTitle>New Lead Magnet</DialogTitle></DialogHeader>
        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 py-2">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0] || null); }}
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
            >
              <UploadCloud className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              {file ? (
                <div>
                  <p className="font-medium text-sm">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  <Button size="sm" variant="ghost" className="mt-2" onClick={() => setFile(null)}>Remove</Button>
                </div>
              ) : (
                <>
                  <p className="text-sm">Drag & drop a PDF or asset here</p>
                  <p className="text-xs text-muted-foreground mb-2">or</p>
                  <Input type="file" accept="application/pdf,.pdf,.docx,.doc,.zip" onChange={(e) => handleFile(e.target.files?.[0] || null)} className="max-w-xs mx-auto" />
                </>
              )}
            </div>

            <div>
              <Label>Title *</Label>
              <Input value={title} onChange={(e) => { setTitle(e.target.value); if (!slug) setSlug(slugify(e.target.value)); }} placeholder="e.g. The First-Time Investor Playbook" />
            </div>
            <div>
              <Label>Slug *</Label>
              <Input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder="auto-generated from title" />
              <p className="text-xs text-muted-foreground mt-1">URL: /lead-magnet-embed.html?slug={slug || 'your-slug'}</p>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Shown on the capture page above the form" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>GHL Pipeline</Label>
                <Select value={pipelineGhl} onValueChange={(v) => { setPipelineGhl(v); setStageGhl(UNASSIGNED); }}>
                  <SelectTrigger><SelectValue placeholder="Select pipeline" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>None</SelectItem>
                    {pipelines.map(p => <SelectItem key={p.id} value={p.ghl_id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Pipeline Stage</Label>
                <Select value={stageGhl} onValueChange={setStageGhl} disabled={pipelineGhl === UNASSIGNED}>
                  <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>None</SelectItem>
                    {filteredStages.map(s => <SelectItem key={s.id} value={s.ghl_id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>GHL Contact Tag</Label>
              <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder={`Lead Magnet: ${title || 'Title'}`} />
              <p className="text-xs text-muted-foreground mt-1">Defaults to "Lead Magnet: {'{title}'}" if blank.</p>
            </div>
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !title || !file}>
            {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DownloadsDialog({ magnet, onClose }: { magnet: LeadMagnet | null; onClose: () => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!magnet) return;
    setLoading(true);
    invokeSecureFunction('manage-lead-magnets', { operation: 'list_downloads', magnet_id: magnet.id })
      .then(({ data }) => setRows(data?.downloads || []))
      .finally(() => setLoading(false));
  }, [magnet]);

  return (
    <Dialog open={!!magnet} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
        <DialogHeader><DialogTitle>Captures — {magnet?.title}</DialogTitle></DialogHeader>
        <ScrollArea className="flex-1 -mx-6 px-6">
          {loading ? (
            <div className="py-8 text-center"><Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No downloads yet.</p>
          ) : (
            <div className="space-y-1.5">
              {rows.map(r => (
                <div key={r.id} className="text-sm border rounded p-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.full_name} <span className="text-muted-foreground font-normal">— {r.email}</span></p>
                    <p className="text-xs text-muted-foreground">{r.phone || 'no phone'} · {new Date(r.created_at).toLocaleString()}</p>
                  </div>
                  <Badge variant={r.ghl_synced ? 'default' : 'secondary'}>{r.ghl_synced ? 'GHL synced' : 'Pending'}</Badge>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
