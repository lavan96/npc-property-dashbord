/**
 * AddPropertyToCalculatorsDialog
 * ---------------------------------------------------------------------------
 * Single dialog that exposes the 8 supported property input methods. Each
 * method routes through the Property Injection Pipeline.
 *
 *  1. Manual address entry
 *  2. New Commercial
 *  3. New Industrial
 *  4. URL scrape           → scrape-property-listing
 *  5. PDF / IM upload      → parse-property-pdf
 *  6. Contract upload      → parse-property-pdf (Contract Extracted)
 *  7. Lease upload         → parse-property-pdf (Lease Extracted)
 *  8. Existing saved
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, MapPin, Building2, Factory, Link2, FileText, FileSignature, FileCheck2, FolderOpen } from 'lucide-react';
import { commercialApi, type CommercialProperty } from '@/hooks/useCommercialProperties';
import { industrialApi, type IndustrialProperty } from '@/hooks/useIndustrialProperties';
import { invokeSecureFunction } from '@/integrations/supabase/secureInvoke';
import {
  persistDraftAsProperty,
  normaliseExtractedToPrefill,
  type PropertyInputMethod,
} from '@/utils/commercial/propertyInjectionPipeline';
import type { CalculatorDomain } from '@/contexts/CalculatorPrefillContext';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called after a property is created/selected with its id + domain.
   * Caller is responsible for navigating to /calculators?domain=...&propertyId=...
   * or calling selectProperty(id) on the prefill context.
   */
  onPropertyReady: (info: { id: string; domain: CalculatorDomain; method: PropertyInputMethod }) => void;
  /** Optional default domain to preselect. */
  defaultDomain?: CalculatorDomain;
}

const STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

export function AddPropertyToCalculatorsDialog({ open, onOpenChange, onPropertyReady, defaultDomain = 'commercial' }: Props) {
  const [tab, setTab] = useState<PropertyInputMethod>('manual_address');
  const [domain, setDomain] = useState<CalculatorDomain>(defaultDomain);
  const navigate = useNavigate();

  useEffect(() => { if (open) setDomain(defaultDomain); }, [open, defaultDomain]);

  const handleReady = (id: string, method: PropertyInputMethod, dom = domain) => {
    onPropertyReady({ id, domain: dom, method });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Add property to Calculators</DialogTitle>
          <DialogDescription>
            Pick a source. Known values cascade into every calculator tab; unknown fields stay blank.
            Use <em>Run AI Estimates</em> after loading to fill remaining assumptions (labelled as estimates).
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 border-b pb-3">
          <Label className="text-xs uppercase text-muted-foreground">Asset domain</Label>
          <Select value={domain} onValueChange={(v) => setDomain(v as CalculatorDomain)}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="commercial">Commercial</SelectItem>
              <SelectItem value="industrial">Industrial</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as PropertyInputMethod)} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid grid-cols-4 lg:grid-cols-8 h-auto">
            <TabsTrigger value="manual_address" className="text-xs"><MapPin className="h-3 w-3 mr-1" />Manual</TabsTrigger>
            <TabsTrigger value="new_commercial" className="text-xs"><Building2 className="h-3 w-3 mr-1" />New Comm.</TabsTrigger>
            <TabsTrigger value="new_industrial" className="text-xs"><Factory className="h-3 w-3 mr-1" />New Ind.</TabsTrigger>
            <TabsTrigger value="url_scrape" className="text-xs"><Link2 className="h-3 w-3 mr-1" />URL</TabsTrigger>
            <TabsTrigger value="pdf_upload" className="text-xs"><FileText className="h-3 w-3 mr-1" />PDF / IM</TabsTrigger>
            <TabsTrigger value="contract_upload" className="text-xs"><FileSignature className="h-3 w-3 mr-1" />Contract</TabsTrigger>
            <TabsTrigger value="lease_upload" className="text-xs"><FileCheck2 className="h-3 w-3 mr-1" />Lease</TabsTrigger>
            <TabsTrigger value="existing_saved" className="text-xs"><FolderOpen className="h-3 w-3 mr-1" />Existing</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto pt-4">
            <TabsContent value="manual_address"><ManualAddressForm domain={domain} onReady={(id) => handleReady(id, 'manual_address')} /></TabsContent>
            <TabsContent value="new_commercial"><FormRedirectNotice label="New Commercial property form" onGo={() => { onOpenChange(false); navigate('/commercial?new=commercial'); }} /></TabsContent>
            <TabsContent value="new_industrial"><FormRedirectNotice label="New Industrial property form" onGo={() => { onOpenChange(false); navigate('/commercial?new=industrial'); }} /></TabsContent>
            <TabsContent value="url_scrape"><DocSourceForm method="url_scrape" domain={domain} onReady={(id, m) => handleReady(id, m)} /></TabsContent>
            <TabsContent value="pdf_upload"><DocSourceForm method="pdf_upload" domain={domain} onReady={(id, m) => handleReady(id, m)} /></TabsContent>
            <TabsContent value="contract_upload"><DocSourceForm method="contract_upload" domain={domain} onReady={(id, m) => handleReady(id, m)} /></TabsContent>
            <TabsContent value="lease_upload"><DocSourceForm method="lease_upload" domain={domain} onReady={(id, m) => handleReady(id, m)} /></TabsContent>
            <TabsContent value="existing_saved"><ExistingPropertyPicker domain={domain} onReady={(id, dom) => handleReady(id, 'existing_saved', dom)} /></TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------
// Sub-forms
// ----------------------------------------------------------------------------

function ManualAddressForm({ domain, onReady }: { domain: CalculatorDomain; onReady: (id: string) => void }) {
  const [address, setAddress] = useState('');
  const [suburb, setSuburb] = useState('');
  const [state, setState] = useState('');
  const [postcode, setPostcode] = useState('');
  const [assetSubtype, setAssetSubtype] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!address.trim()) { toast.error('Address is required.'); return; }
    setSaving(true);
    try {
      const fullAddress = [address, suburb, state, postcode].filter(Boolean).join(', ');
      const { id } = await persistDraftAsProperty({
        domain,
        method: 'manual_address',
        values: { address: fullAddress, state: state || null, assetSubtype: assetSubtype || null },
      });
      toast.success('Property created. Loading into calculators…');
      onReady(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create property');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Only the address is required. Address, suburb, state, property domain and asset type become the initial research basis for AI estimates.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Label>Street address *</Label><Input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Smith St" /></div>
        <div><Label>Suburb</Label><Input value={suburb} onChange={e => setSuburb(e.target.value)} /></div>
        <div><Label>Postcode</Label><Input value={postcode} onChange={e => setPostcode(e.target.value)} /></div>
        <div>
          <Label>State</Label>
          <Select value={state} onValueChange={setState}>
            <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
            <SelectContent>{STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Asset sub-type</Label>
          <Input value={assetSubtype} onChange={e => setAssetSubtype(e.target.value)} placeholder="e.g. warehouse, office" />
        </div>
      </div>
      <div className="flex justify-end pt-2">
        <Button onClick={submit} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Create & load into calculators
        </Button>
      </div>
    </div>
  );
}

function FormRedirectNotice({ label, onGo }: { label: string; onGo: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Use the full {label}. After saving the property, it will appear in the <em>Existing saved property</em> tab and can be loaded into the calculator suite.
      </p>
      <Button onClick={onGo}>Open {label}</Button>
    </div>
  );
}

function DocSourceForm({
  method,
  domain,
  onReady,
}: {
  method: 'url_scrape' | 'pdf_upload' | 'contract_upload' | 'lease_upload';
  domain: CalculatorDomain;
  onReady: (id: string, method: PropertyInputMethod) => void;
}) {
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const labels = {
    url_scrape: { title: 'Property listing URL', help: 'Paste a public commercial/industrial listing URL.' },
    pdf_upload: { title: 'PDF or Information Memorandum', help: 'Upload a listing PDF or IM. AI will extract address, areas, price and key metrics.' },
    contract_upload: { title: 'Contract of Sale (PDF)', help: 'Values extracted from the contract are tagged as Contract Extracted in the assumption store.' },
    lease_upload: { title: 'Lease document (PDF)', help: 'Values extracted from the lease are tagged as Lease Extracted in the assumption store.' },
  };
  const meta = labels[method];
  const isUrl = method === 'url_scrape';

  const runScrape = async () => {
    if (!url.trim()) { toast.error('URL is required.'); return; }
    setBusy(true);
    try {
      const { data: startData, error: startError } = await invokeSecureFunction('scrape-property-listing', {
        url, propertyCategory: domain === 'industrial' ? 'industrial' : 'commercial',
      }, { timeoutMs: 60000 });
      if (startError) throw new Error(startError.message || 'Scrape failed to start');
      if (!startData?.success || !startData?.jobId) throw new Error(startData?.error || 'Scrape failed to start');

      const jobId = startData.jobId;
      const started = Date.now();
      let result: any = null;
      while (Date.now() - started < 1500_000) {
        await new Promise(r => setTimeout(r, 5000));
        const { data: poll } = await invokeSecureFunction('scrape-property-listing', { jobId }, { timeoutMs: 60000 });
        if (poll?.status === 'succeeded') { result = poll.data; break; }
        if (poll?.status === 'failed') throw new Error(poll.error || 'Scrape failed');
      }
      if (!result) throw new Error('Scrape timed out.');

      const values = normaliseExtractedToPrefill(result, domain);
      const { id } = await persistDraftAsProperty({ domain, method, values, raw: result });
      toast.success('Listing scraped. Loading into calculators…');
      onReady(id, method);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Scrape failed');
    } finally { setBusy(false); }
  };

  const runParse = async () => {
    if (!file) { toast.error('Select a file first.'); return; }
    setBusy(true);
    try {
      // Convert PDF→images using existing helper if available; for brevity send singleImage when image.
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      let requestBody: any = { fileName: file.name, propertyCategory: domain === 'industrial' ? 'industrial' : 'commercial', documentHint: method };

      if (isPdf) {
        const { convertPdfToImages } = await import('@/utils/pdfToImages');
        const conv = await convertPdfToImages(file);
        if (!conv.success) throw new Error(conv.error || 'PDF conversion failed');
        requestBody.pageImages = conv.images.map(img => ({ pageNumber: img.pageNumber, base64: img.base64, width: img.width, height: img.height }));
      } else {
        const base64 = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '');
          fr.onerror = () => reject(fr.error);
          fr.readAsDataURL(file);
        });
        requestBody.singleImage = base64;
        requestBody.imageMimeType = file.type || 'image/png';
      }

      const { data, error } = await invokeSecureFunction('parse-property-pdf', requestBody, { timeoutMs: 300000 });
      if (error) throw new Error(error.message || 'Parse failed');
      if (!data?.success) throw new Error(data?.error || 'Parse failed');

      const extracted = data.extractedData || data.structuredPayload || {};
      const values = normaliseExtractedToPrefill(extracted, domain);
      const { id } = await persistDraftAsProperty({ domain, method, values, raw: extracted });
      toast.success('Document parsed. Loading into calculators…');
      onReady(id, method);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Parse failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{meta.help}</p>
      {isUrl ? (
        <div className="space-y-2">
          <Label>{meta.title}</Label>
          <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." />
          <div className="flex justify-end">
            <Button onClick={runScrape} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Scrape & load</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>{meta.title}</Label>
          <Input type="file" accept=".pdf,image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          {file && <div className="text-xs text-muted-foreground">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</div>}
          <div className="flex justify-end">
            <Button onClick={runParse} disabled={busy || !file}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Parse & load</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ExistingPropertyPicker({ domain, onReady }: { domain: CalculatorDomain; onReady: (id: string, dom: CalculatorDomain) => void }) {
  const [commercial, setCommercial] = useState<CommercialProperty[]>([]);
  const [industrial, setIndustrial] = useState<IndustrialProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [c, i] = await Promise.all([commercialApi.listProperties(), industrialApi.listProperties()]);
      if (cancelled) return;
      if (c.data) setCommercial(c.data as CommercialProperty[]);
      if (i.data) setIndustrial(i.data as IndustrialProperty[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => {
    const items: Array<{ id: string; label: string; dom: CalculatorDomain }> = [];
    if (domain === 'commercial' || domain === 'industrial') {
      if (domain === 'commercial') {
        commercial.forEach(p => items.push({ id: p.id, dom: 'commercial', label: `${p.address}${p.suburb ? `, ${p.suburb} ${p.state ?? ''}` : ''}` }));
      } else {
        industrial.forEach(p => items.push({ id: p.id, dom: 'industrial', label: `${p.property_name || p.street || 'Untitled'}${p.suburb ? `, ${p.suburb} ${p.state ?? ''}` : ''}` }));
      }
    }
    const f = filter.trim().toLowerCase();
    return f ? items.filter(it => it.label.toLowerCase().includes(f)) : items;
  }, [commercial, industrial, domain, filter]);

  if (loading) return <div className="text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 mr-2 animate-spin" />Loading properties…</div>;

  return (
    <div className="space-y-3">
      <Input placeholder="Search address…" value={filter} onChange={e => setFilter(e.target.value)} />
      <div className="rounded-md border max-h-[420px] overflow-y-auto divide-y">
        {rows.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No saved properties match.</div>
        ) : rows.map(r => (
          <button
            key={r.id}
            onClick={() => onReady(r.id, r.dom)}
            className="w-full text-left p-3 hover:bg-muted/40 text-sm flex items-center justify-between"
          >
            <span>{r.label}</span>
            <span className="text-xs text-muted-foreground capitalize">{r.dom}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
