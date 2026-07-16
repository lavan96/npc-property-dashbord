import { useEffect, useState } from "react";
import { ShieldCheck, Loader2, RefreshCw } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import type { AmlCapability } from "@/lib/aml/permissions";

export interface StepUpVerifiedPayload {
  session_token: string;
  capability: AmlCapability;
  expires_at: string;
}

interface StepUpAuthDialogProps {
  open: boolean;
  capability: AmlCapability;
  onCancel: () => void;
  onConfirm: (payload: StepUpVerifiedPayload) => void;
}

const CAPABILITY_LABELS: Record<AmlCapability, string> = {
  "aml.view": "View AML surface",
  "aml.investigate": "Investigate AML case",
  "aml.report": "Lodge AUSTRAC report",
  "aml.configure": "Change AML configuration",
};

/**
 * Phase 13 step-up prompt.
 *
 * Server-issued 6-digit challenge via the `aml-step-up` edge function. Successful
 * verification returns a short-lived session token that AmlGuard persists.
 */
export function StepUpAuthDialog({ open, capability, onCancel, onConfirm }: StepUpAuthDialogProps) {
  const [phase, setPhase] = useState<"issue" | "verify">("issue");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null); // shown in-app until email/authenticator wired
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = CAPABILITY_LABELS[capability] ?? capability;

  useEffect(() => {
    if (!open) {
      setPhase("issue"); setChallengeId(null); setDevCode(null); setCode(""); setError(null); setBusy(false);
    }
  }, [open]);

  const issue = async () => {
    setBusy(true); setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("aml-step-up", {
        body: { op: "issue", capability },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setChallengeId((data as any).challenge_id);
      setDevCode((data as any).code ?? null);
      setPhase("verify");
    } catch (e: any) {
      setError(e?.message ?? "Failed to issue challenge");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!challengeId || code.trim().length < 4) return;
    setBusy(true); setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("aml-step-up", {
        body: { op: "verify", challenge_id: challengeId, code: code.trim() },
      });
      if (error) throw error;
      const d = data as any;
      if (d?.error) throw new Error(d.error);
      onConfirm({ session_token: d.session_token, capability, expires_at: d.expires_at });
    } catch (e: any) {
      setError(e?.message ?? "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (open && phase === "issue" && !busy && !challengeId) {
      void issue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <DialogTitle>Step-up required</DialogTitle>
          </div>
          <DialogDescription>
            Restricted capability: <span className="font-medium">{label}</span>. Enter the
            6-digit code we just issued to continue. The grant is scoped to your session for
            15 minutes and every action taken is written to the AML audit chain.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {phase === "verify" && devCode ? (
          <Alert>
            <AlertDescription>
              In-app delivery (dev): <code className="font-mono font-semibold text-base">{devCode}</code>.
              Production will deliver via authenticator app / email.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-2 pt-2">
          <Label htmlFor="aml-step-up-code">Verification code</Label>
          <Input
            id="aml-step-up-code"
            autoFocus
            inputMode="numeric"
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="000000"
            disabled={busy || phase === "issue"}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="outline" onClick={() => { setChallengeId(null); setCode(""); void issue(); }} disabled={busy}>
            <RefreshCw className="mr-2 h-4 w-4" /> New code
          </Button>
          <Button onClick={verify} disabled={busy || phase !== "verify" || code.trim().length < 4}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
