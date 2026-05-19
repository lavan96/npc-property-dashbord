/**
 * Device Management — lists the active devices counting toward the user's
 * Mission Control device cap and lets them revoke any of them. The current
 * browser is highlighted using the locally-stored device id.
 */
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Loader2, RefreshCw, Smartphone, Trash2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { listMyDevices, revokeDevice, type DeviceRow } from '@/lib/deviceSession';
import { getStoredDeviceId } from '@/lib/deviceFingerprint';
import { useToast } from '@/hooks/use-toast';

function formatRelative(iso: string | null): string {
  if (!iso) return 'unknown';
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return 'unknown';
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function DeviceManagementCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [deviceLimit, setDeviceLimit] = useState(0);
  const [devicesActive, setDevicesActive] = useState(0);
  const [revoking, setRevoking] = useState<string | null>(null);
  const currentId = getStoredDeviceId();

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await listMyDevices();
      setDevices(res.devices);
      setDeviceLimit(res.device_limit);
      setDevicesActive(res.devices_active);
    } catch (e: any) {
      setError(e?.message || 'Failed to load devices.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleRevoke = async (device: DeviceRow) => {
    if (device.id === currentId) {
      toast({
        title: 'Sign out instead',
        description: 'Revoke the current device by signing out from this browser.',
        variant: 'destructive',
      });
      return;
    }
    setRevoking(device.id);
    const { ok, error: err } = await revokeDevice(device.id);
    setRevoking(null);
    if (!ok) {
      toast({ title: 'Could not revoke', description: err || 'Try again.', variant: 'destructive' });
      return;
    }
    toast({ title: 'Device revoked', description: device.device_label || 'Device removed.' });
    void load(true);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Active devices
            </CardTitle>
            <CardDescription>
              Browsers and devices currently signed in to your account.
              {deviceLimit > 0 && (
                <> Using <strong>{devicesActive}</strong> of <strong>{deviceLimit}</strong> slots.</>
              )}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => load(true)} disabled={loading || refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : devices.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-4 text-center">
            No active devices found.
          </p>
        ) : (
          devices.map((device) => {
            const isCurrent = device.id === currentId;
            return (
              <div
                key={device.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <Smartphone className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {device.device_label || device.platform || 'Browser'}
                      </p>
                      {isCurrent && (
                        <Badge variant="secondary" className="text-[10px]">This device</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      Last active {formatRelative(device.last_seen_at ?? device.created_at)}
                      {device.user_agent ? ` · ${device.user_agent.slice(0, 60)}` : ''}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={revoking === device.id || isCurrent}
                  onClick={() => handleRevoke(device)}
                  title={isCurrent ? 'Sign out to revoke this device' : 'Revoke device'}
                >
                  {revoking === device.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            );
          })
        )}

        <Separator />
        <p className="text-xs text-muted-foreground">
          Revoking a device signs that browser out immediately and frees a device slot.
        </p>
      </CardContent>
    </Card>
  );
}
