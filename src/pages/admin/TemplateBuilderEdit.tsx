/**
 * Template Builder — Editor (Phase 1 placeholder + live PDF preview).
 *
 * Phase 2 will replace the left side with a tldraw canvas and inspector.
 * For now: a JSON editor + live PDF iframe preview, so the renderer is
 * usable end-to-end while the visual editor is built.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, FileJson, Eye, Loader2, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  useReportTemplate,
  useReportTemplateMutations,
  useReportTemplateVersions,
} from '@/hooks/useReportTemplates';
import {
  parseTemplate,
  type ReportTemplate,
} from '@/lib/reportTemplate/templateSchema';
import { renderTemplateToBlob } from '@/lib/reportTemplate/pdfRenderer';

const SAMPLE_DATA = {
  property: { address: '123 Sample Street, Sydney NSW 2000', suburb: 'Sydney' },
  financials: { weeklyRent: 850, purchasePrice: 950000 },
  client: { name: 'Sample Client' },
  tier: 'compass',
};

export default function TemplateBuilderEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: template, isLoading } = useReportTemplate(id);
  const { update } = useReportTemplateMutations();
  const { data: versions = [] } = useReportTemplateVersions(id);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [reportType, setReportType] = useState<string>('');
  const [tier, setTier] = useState<string>('');
  const [schemaText, setSchemaText] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const blobRef = useRef<string | null>(null);

  // Hydrate from server
  useEffect(() => {
    if (!template) return;
    setName(template.name || '');
    setDescription(template.description || '');
    setReportType(template.report_type || '');
    setTier(template.tier || '');
    setSchemaText(JSON.stringify(template.schema, null, 2));
  }, [template]);

  // Parsed schema (memo)
  const parsedSchema = useMemo<ReportTemplate | null>(() => {
    try {
      return parseTemplate(JSON.parse(schemaText));
    } catch {
      return null;
    }
  }, [schemaText]);

  // Debounced preview regen
  useEffect(() => {
    if (!parsedSchema) {
      setPreviewError('Invalid JSON — preview paused');
      return;
    }
    setPreviewError(null);
    setPreviewing(true);
    const handle = setTimeout(() => {
      try {
        const blob = renderTemplateToBlob(parsedSchema, { data: SAMPLE_DATA });
        const url = URL.createObjectURL(blob);
        if (blobRef.current) URL.revokeObjectURL(blobRef.current);
        blobRef.current = url;
        setPreviewUrl(url);
      } catch (e: any) {
        setPreviewError(e?.message || 'Render failed');
      } finally {
        setPreviewing(false);
      }
    }, 600);
    return () => clearTimeout(handle);
  }, [parsedSchema]);

  // Cleanup blob on unmount
  useEffect(() => () => {
    if (blobRef.current) URL.revokeObjectURL(blobRef.current);
  }, []);

  const handleSave = (snapshot = false) => {
    if (!id) return;
    if (!parsedSchema) {
      toast.error('Cannot save: schema JSON is invalid');
      return;
    }
    update.mutate(
      {
        id,
        snapshot,
        patch: {
          name,
          description,
          report_type: reportType || null,
          tier: tier || null,
          schema: parsedSchema,
        } as any,
      },
      { onSuccess: () => toast.success(snapshot ? 'Saved as new version' : 'Saved') },
    );
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Skeleton className="h-12 w-64 mb-6" />
        <Skeleton className="h-[70vh] w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/template-builder')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-lg font-semibold border-0 bg-transparent focus-visible:bg-muted/30 focus-visible:ring-1 max-w-md"
            placeholder="Template name"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => handleSave(true)} disabled={update.isPending}>
            <History className="h-4 w-4 mr-1" /> Save as version
          </Button>
          <Button onClick={() => handleSave(false)} disabled={update.isPending}>
            {update.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Save
          </Button>
        </div>
      </div>

      {/* Body: split editor / preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[75vh]">
        {/* Left: metadata + schema JSON (Phase 1). Phase 2 = tldraw canvas. */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileJson className="h-4 w-4 text-primary" /> Template definition
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="report_type" className="text-xs">Report type</Label>
                <Input
                  id="report_type"
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                  placeholder="e.g. investment"
                />
              </div>
              <div>
                <Label htmlFor="tier" className="text-xs">Tier</Label>
                <Input
                  id="tier"
                  value={tier}
                  onChange={(e) => setTier(e.target.value)}
                  placeholder="e.g. compass"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="description" className="text-xs">Description</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <Tabs defaultValue="schema" className="flex-1 flex flex-col">
              <TabsList className="self-start">
                <TabsTrigger value="schema">Schema (JSON)</TabsTrigger>
                <TabsTrigger value="versions">
                  Versions {versions.length > 0 && `(${versions.length})`}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="schema" className="flex-1 mt-3">
                <Textarea
                  value={schemaText}
                  onChange={(e) => setSchemaText(e.target.value)}
                  spellCheck={false}
                  className="font-mono text-xs h-full min-h-[400px] resize-none"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Phase 1: edit the schema directly. Phase 2 ships a visual tldraw canvas
                  that writes to this same schema.
                </p>
              </TabsContent>
              <TabsContent value="versions" className="flex-1 mt-3 overflow-auto">
                {versions.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    No saved versions yet. Use “Save as version” to snapshot the current state.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {versions.map((v) => (
                      <li
                        key={v.id}
                        className="flex items-center justify-between border rounded-md px-3 py-2 text-sm"
                      >
                        <div>
                          <div className="font-medium">v{v.version}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(v.created_at).toLocaleString('en-AU')}
                            {v.note && ` — ${v.note}`}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSchemaText(JSON.stringify(v.schema, null, 2));
                            toast.info(`Loaded v${v.version}. Click Save to apply.`);
                          }}
                        >
                          Load
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Right: live PDF preview */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" /> Live PDF preview
              {previewing && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-3">
            {previewError ? (
              <div className="h-full flex items-center justify-center text-sm text-destructive border-2 border-dashed border-destructive/30 rounded-md">
                {previewError}
              </div>
            ) : previewUrl ? (
              <iframe
                key={previewUrl}
                src={previewUrl}
                title="PDF preview"
                className="w-full h-full min-h-[600px] rounded-md bg-white"
              />
            ) : (
              <Skeleton className="w-full h-full min-h-[600px]" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
