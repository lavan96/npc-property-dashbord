import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { KeyRound, RefreshCw, Activity, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { invokeSecureFunction } from "@/lib/secureInvoke";
import { fetchTokenBalance } from "@/lib/missionControl";

interface KeyInfo {
  configured: boolean;
  keyPrefix: string | null;
  baseUrl: string | null;
  lastSuccessfulCallAt: string | null;
  lastRotatedAt: string | null;
}

export function MissionControlKeyCard() {
  const { toast } = useToast();
  const [info, setInfo] = useState<KeyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [testing, setTesting] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [graceHours, setGraceHours] = useState(1);
  const [reason, setReason] = useState("");
  const [rotating, setRotating] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    setForbidden(false);
    try {
      const { data, error } = await invokeSecureFunction<KeyInfo>("mission-control-key-info", {});
      if (error) {
        const msg = (error.message ?? "").toLowerCase();
        if (msg.includes("forbid")) setForbidden(true);
        else setLoadError(error.message ?? "Failed to load");
        setInfo(null);
        return;
      }
      setInfo(data ?? null);
    } catch (e: any) {
      console.warn("[MissionControlKeyCard] load", e);
      setLoadError(e?.message ?? "Failed to load");
      setInfo(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const testConnection = async () => {
    setTesting(true);
    try {
      const bal = await fetchTokenBalance();
      toast({
        title: "Connection OK",
        description: `Available: ${bal.available.toLocaleString()} · Reserved: ${bal.reserved.toLocaleString()}`,
      });
      load();
    } catch (e: any) {
      toast({ title: "Test failed", description: e.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const rotate = async () => {
    setRotating(true);
    try {
      const { data, error } = await invokeSecureFunction<any>("mission-control-rotate-key", {
        grace_hours: graceHours,
        reason: reason || "manual_rotation",
      });
      if (error) throw new Error(error.message ?? "Failed");
      const revoke = data?.revokeAt ? new Date(data.revokeAt).toLocaleString() : "soon";
      toast({
        title: "Key rotated",
        description: `New prefix ${data?.keyPrefix ?? "(unknown)"} is live; previous key is revoked at ${revoke}.`,
      });
      setRotateOpen(false);
      setReason("");
      load();
    } catch (e: any) {
      toast({ title: "Rotation failed", description: e.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setRotating(false);
    }
  };

  // Hide entirely for non-superadmins (info will be null after a 403).
  if (!loading && !info) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          Mission Control Key
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Current key">
                {info?.configured ? (
                  <code className="text-sm">{info?.keyPrefix ?? "(set)"}</code>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" /> Not configured
                  </Badge>
                )}
              </Field>
              <Field label="Base URL">
                <span className="text-sm text-muted-foreground break-all">
                  {info?.baseUrl ?? "—"}
                </span>
              </Field>
              <Field label="Last successful call">
                <span className="text-sm text-muted-foreground">
                  {info?.lastSuccessfulCallAt
                    ? new Date(info.lastSuccessfulCallAt).toLocaleString()
                    : "Never"}
                </span>
              </Field>
              <Field label="Last rotation">
                <span className="text-sm text-muted-foreground">
                  {info?.lastRotatedAt
                    ? new Date(info.lastRotatedAt).toLocaleString()
                    : "—"}
                </span>
              </Field>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="secondary" onClick={testConnection} disabled={testing || !info?.configured}>
                {testing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Activity className="h-4 w-4 mr-2" />}
                Test connection
              </Button>
              <Button onClick={() => setRotateOpen(true)} disabled={!info?.configured}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Rotate key
              </Button>
            </div>

            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              The raw secret is never shown — it's written straight into the project secrets store. The previous key keeps working during the grace period you choose, then Mission Control revokes it automatically.
            </p>
          </>
        )}
      </CardContent>

      <Dialog open={rotateOpen} onOpenChange={setRotateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rotate Mission Control key</DialogTitle>
            <DialogDescription>
              Issues a new clone API key. The previous key remains valid for the grace period below, after which Mission Control revokes it automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="grace">Grace period (hours)</Label>
              <Input
                id="grace" type="number" min={0} max={168} value={graceHours}
                onChange={(e) => setGraceHours(Math.max(0, Math.min(168, Number(e.target.value) || 0)))}
              />
              <p className="text-xs text-muted-foreground">0–168. Default 1 hour.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason (optional)</Label>
              <Textarea
                id="reason" value={reason} maxLength={280}
                placeholder="e.g. quarterly rotation, suspected exposure…"
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRotateOpen(false)} disabled={rotating}>Cancel</Button>
            <Button onClick={rotate} disabled={rotating}>
              {rotating && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              Rotate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  );
}
