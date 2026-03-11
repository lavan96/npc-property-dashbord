import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Megaphone, Edit, Save, X, Plus, Trash2, Globe, Target, ExternalLink } from 'lucide-react';
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
  meta_adset_id: string | null;
  meta_ad_id: string | null;
  source_type: 'webhook_auto' | 'manual' | 'csv_import';
  landing_page_url: string | null;
  referrer_url: string | null;
  ghl_contact_id: string | null;
  attributed_at: string;
  notes: string | null;
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
};

export function LeadSourceCard({ clientId, attributions, onRefresh }: LeadSourceCardProps) {
  const [editing, setEditing] = useState(false);
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

  const primary = attributions[0];

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
      <CardContent className="space-y-3">
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
            <div key={attr.id} className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  {attr.utm_source && (
                    <Badge variant="outline" className="text-[10px]">
                      <Target className="h-2.5 w-2.5 mr-0.5" />
                      {attr.utm_source}
                    </Badge>
                  )}
                  {attr.utm_campaign && (
                    <Badge variant="secondary" className="text-[10px]">{attr.utm_campaign}</Badge>
                  )}
                  <Badge variant="outline" className={`text-[9px] ${SOURCE_TYPE_LABELS[attr.source_type]?.color || ''}`}>
                    {SOURCE_TYPE_LABELS[attr.source_type]?.label || attr.source_type}
                  </Badge>
                </div>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(attr.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                {attr.utm_medium && (
                  <div><span className="text-muted-foreground">Medium:</span> <span className="font-medium">{attr.utm_medium}</span></div>
                )}
                {attr.utm_content && (
                  <div><span className="text-muted-foreground">Content:</span> <span className="font-medium">{attr.utm_content}</span></div>
                )}
                {attr.utm_term && (
                  <div><span className="text-muted-foreground">Term:</span> <span className="font-medium">{attr.utm_term}</span></div>
                )}
                {attr.meta_campaign_id && (
                  <div><span className="text-muted-foreground">Meta ID:</span> <span className="font-mono font-medium">{attr.meta_campaign_id}</span></div>
                )}
              </div>

              {attr.landing_page_url && (
                <div className="text-[10px] text-muted-foreground flex items-center gap-1 truncate">
                  <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">{attr.landing_page_url}</span>
                </div>
              )}
              {attr.notes && (
                <p className="text-[11px] text-muted-foreground italic">{attr.notes}</p>
              )}
              <p className="text-[9px] text-muted-foreground">
                Attributed: {format(new Date(attr.attributed_at), 'dd MMM yyyy')}
              </p>
            </div>
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
