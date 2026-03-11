import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Megaphone, Save, X, Plus, Trash2, Globe, Target, ExternalLink, Layers, ChevronDown, ChevronUp } from 'lucide-react';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Attribution {
  id: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  meta_campaign_id: string | null;
  meta_campaign_name: string | null;
  meta_adset_id: string | null;
  meta_adset_name: string | null;
  meta_ad_id: string | null;
  meta_ad_name: string | null;
  source_type: 'webhook_auto' | 'manual' | 'csv_import' | 'backfill';
  landing_page_url: string | null;
  referrer_url: string | null;
  ghl_contact_id: string | null;
  attributed_at: string;
  notes: string | null;
  fbclid: string | null;
  gclid: string | null;
  device_type: string | null;
  geo_location: string | null;
}

interface LeadSourceCardProps {
  clientId: string;
  attributions: Attribution[];
  onRefresh: () => void;
}

const SOURCE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  webhook_auto: { label: 'Auto (GHL)', color: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' },
  manual: { label: 'Manual', color: 'bg-blue-500/10 text-blue-700 border-blue-500/20' },
  csv_import: { label: 'CSV Import', color: 'bg-amber-500/10 text-amber-700 border-amber-500/20' },
  backfill: { label: 'Backfill', color: 'bg-purple-500/10 text-purple-700 border-purple-500/20' },
};

function AttributionItem({ attr, onDelete }: { attr: Attribution; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  
  const campaignName = attr.meta_campaign_name || attr.utm_campaign;
  const adsetName = attr.meta_adset_name || attr.utm_medium;
  const adName = attr.meta_ad_name || attr.utm_content;
  const source = attr.utm_source || 'Unknown';
  const hasDetails = campaignName || adsetName || adName || attr.meta_campaign_id;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] font-semibold">
            <Target className="h-2.5 w-2.5 mr-0.5" />
            {source}
          </Badge>
          <Badge variant="outline" className={`text-[9px] ${SOURCE_TYPE_LABELS[attr.source_type]?.color || ''}`}>
            {SOURCE_TYPE_LABELS[attr.source_type]?.label || attr.source_type}
          </Badge>
          {(attr.fbclid || attr.gclid) && (
            <Badge variant="secondary" className="text-[9px]">
              {attr.fbclid ? 'fbclid' : 'gclid'} ✓
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {hasDetails && (
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => onDelete(attr.id)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Campaign hierarchy - always visible if data exists */}
      {campaignName && (
        <div className="space-y-1">
          <div className="flex items-start gap-1.5">
            <Layers className="h-3 w-3 text-primary mt-0.5 shrink-0" />
            <div className="text-[11px] space-y-0.5 min-w-0">
              <div>
                <span className="text-muted-foreground">Campaign: </span>
                <span className="font-medium text-foreground break-words">{campaignName}</span>
              </div>
              {adsetName && (
                <div className="pl-2 border-l border-border/40">
                  <span className="text-muted-foreground">Ad Set: </span>
                  <span className="font-medium text-foreground break-words">{adsetName}</span>
                </div>
              )}
              {adName && (
                <div className="pl-4 border-l border-border/40">
                  <span className="text-muted-foreground">Ad: </span>
                  <span className="font-medium text-foreground break-words">{adName}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="pt-1 border-t border-border/30 space-y-1.5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
            {attr.meta_campaign_id && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Campaign ID: </span>
                <span className="font-mono text-foreground">{attr.meta_campaign_id}</span>
              </div>
            )}
            {attr.meta_adset_id && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Ad Set ID: </span>
                <span className="font-mono text-foreground">{attr.meta_adset_id}</span>
              </div>
            )}
            {attr.meta_ad_id && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Ad ID: </span>
                <span className="font-mono text-foreground">{attr.meta_ad_id}</span>
              </div>
            )}
            {attr.utm_term && (
              <div>
                <span className="text-muted-foreground">Term: </span>
                <span className="font-medium">{attr.utm_term}</span>
              </div>
            )}
            {attr.device_type && (
              <div>
                <span className="text-muted-foreground">Device: </span>
                <span className="font-medium">{attr.device_type}</span>
              </div>
            )}
            {attr.geo_location && (
              <div>
                <span className="text-muted-foreground">Location: </span>
                <span className="font-medium">{attr.geo_location}</span>
              </div>
            )}
            {attr.fbclid && (
              <div className="col-span-2 truncate">
                <span className="text-muted-foreground">Click ID: </span>
                <span className="font-mono text-foreground">{attr.fbclid}</span>
              </div>
            )}
            {attr.gclid && (
              <div className="col-span-2 truncate">
                <span className="text-muted-foreground">GCLID: </span>
                <span className="font-mono text-foreground">{attr.gclid}</span>
              </div>
            )}
          </div>

          {attr.landing_page_url && (
            <div className="text-[10px] text-muted-foreground flex items-center gap-1 truncate">
              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{attr.landing_page_url}</span>
            </div>
          )}
        </div>
      )}

      {attr.notes && (
        <p className="text-[11px] text-muted-foreground italic">{attr.notes}</p>
      )}
      <p className="text-[9px] text-muted-foreground">
        Attributed: {format(new Date(attr.attributed_at), 'dd MMM yyyy')}
      </p>
    </div>
  );
}

export function LeadSourceCard({ clientId, attributions, onRefresh }: LeadSourceCardProps) {
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newAttribution, setNewAttribution] = useState({
    utm_source: '',
    utm_medium: '',
    utm_campaign: '',
    utm_content: '',
    utm_term: '',
    meta_campaign_id: '',
    landing_page_url: '',
    notes: '',
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data, error } = await invokeSecureFunction('manage-client-data', {
        operation: 'create',
        table: 'lead_source_attributions',
        clientId,
        data: {
          ...newAttribution,
          source_type: 'manual',
          attributed_at: new Date().toISOString(),
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to save');
      toast.success('Lead source attribution saved');
      setAdding(false);
      setNewAttribution({ utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '', meta_campaign_id: '', landing_page_url: '', notes: '' });
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save attribution');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { data, error } = await invokeSecureFunction('manage-client-data', {
        operation: 'delete',
        table: 'lead_source_attributions',
        clientId,
        recordId: id,
      });
      if (error) throw error;
      toast.success('Attribution removed');
      onRefresh();
    } catch {
      toast.error('Failed to remove attribution');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" />
            How They Found Us
          </CardTitle>
          <div className="flex items-center gap-1">
            {!adding && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setAdding(true)}>
                <Plus className="h-3 w-3 mr-1" />
                Add Source
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 max-h-[350px] overflow-y-auto">
        {attributions.length === 0 && !adding ? (
          <div className="text-center py-4 text-muted-foreground">
            <Globe className="h-6 w-6 mx-auto mb-1.5 opacity-40" />
            <p className="text-xs">No lead source recorded</p>
            <Button variant="outline" size="sm" className="mt-2 text-xs" onClick={() => setAdding(true)}>
              <Plus className="h-3 w-3 mr-1" /> Add Lead Source
            </Button>
          </div>
        ) : (
          attributions.map((attr) => (
            <AttributionItem key={attr.id} attr={attr} onDelete={handleDelete} />
          ))
        )}

        {/* Add new attribution form */}
        {adding && (
          <div className="rounded-lg border border-primary/20 bg-primary/[0.02] p-3 space-y-3">
            <p className="text-xs font-semibold text-foreground">Add Lead Source</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Source</Label>
                <Input
                  className="h-7 text-xs"
                  placeholder="e.g. meta, google, referral"
                  value={newAttribution.utm_source}
                  onChange={(e) => setNewAttribution(prev => ({ ...prev, utm_source: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-[10px]">Medium</Label>
                <Input
                  className="h-7 text-xs"
                  placeholder="e.g. cpc, organic, email"
                  value={newAttribution.utm_medium}
                  onChange={(e) => setNewAttribution(prev => ({ ...prev, utm_medium: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-[10px]">Campaign</Label>
                <Input
                  className="h-7 text-xs"
                  placeholder="Campaign name"
                  value={newAttribution.utm_campaign}
                  onChange={(e) => setNewAttribution(prev => ({ ...prev, utm_campaign: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-[10px]">Content / Ad</Label>
                <Input
                  className="h-7 text-xs"
                  placeholder="Ad name or ID"
                  value={newAttribution.utm_content}
                  onChange={(e) => setNewAttribution(prev => ({ ...prev, utm_content: e.target.value }))}
                />
              </div>
              <div className="col-span-2">
                <Label className="text-[10px]">Landing Page URL</Label>
                <Input
                  className="h-7 text-xs"
                  placeholder="https://..."
                  value={newAttribution.landing_page_url}
                  onChange={(e) => setNewAttribution(prev => ({ ...prev, landing_page_url: e.target.value }))}
                />
              </div>
              <div className="col-span-2">
                <Label className="text-[10px]">Notes</Label>
                <Textarea
                  className="text-xs min-h-[40px]"
                  placeholder="Optional notes..."
                  value={newAttribution.notes}
                  onChange={(e) => setNewAttribution(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAdding(false)}>
                <X className="h-3 w-3 mr-1" /> Cancel
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>
                <Save className="h-3 w-3 mr-1" /> {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
