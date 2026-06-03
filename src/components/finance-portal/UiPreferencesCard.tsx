/**
 * Batch 9 — UI preferences card (density, default landing, mobile flag).
 */
import { useEffect, useState } from 'react';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

const FN = 'finance-portal-batch9-10';

export function UiPreferencesCard() {
  const { invokeFinanceFunction } = useFinancePortalAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [landing, setLanding] = useState('dashboard');
  const [mobileFlag, setMobileFlag] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await invokeFinanceFunction(FN, { operation: 'ui_prefs_get' });
      const p = data?.prefs;
      if (p) {
        setDensity(p.density ?? 'comfortable');
        setLanding(p.default_landing ?? 'dashboard');
        setMobileFlag(!!p.mobile_optimized);
      }
      setLoading(false);
    })();
  }, [invokeFinanceFunction]);

  const save = async () => {
    setSaving(true);
    const { error } = await invokeFinanceFunction(FN, {
      operation: 'ui_prefs_set',
      density,
      default_landing: landing,
      mobile_optimized: mobileFlag,
    });
    setSaving(false);
    if (error) return toast.error('Save failed');
    try {
      localStorage.setItem('finance_density', density);
    } catch {}
    toast.success('Preferences saved');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-primary" /> Display & landing
        </CardTitle>
        <CardDescription>How dense should lists be, and where should you land on login?</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label className="text-xs">Table density</Label>
                <Select value={density} onValueChange={(v) => setDensity(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comfortable">Comfortable</SelectItem>
                    <SelectItem value="compact">Compact</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Default landing</Label>
                <Select value={landing} onValueChange={setLanding}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dashboard">Dashboard</SelectItem>
                    <SelectItem value="purchase-files">Active Purchase Files</SelectItem>
                    <SelectItem value="pipeline">Pipeline Kanban</SelectItem>
                    <SelectItem value="client-inbox">Client Inbox</SelectItem>
                    <SelectItem value="mobile">Mobile cockpit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <div>
                <Label className="text-sm">Mobile-optimised UI</Label>
                <p className="text-xs text-muted-foreground">Always start the mobile cockpit when opening on phone.</p>
              </div>
              <Switch checked={mobileFlag} onCheckedChange={setMobileFlag} />
            </div>
            <Button onClick={save} disabled={saving} size="sm">
              {saving ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Save className="h-3 w-3 mr-1.5" />}
              Save preferences
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
