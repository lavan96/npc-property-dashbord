import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import { amlCasesApi, type AmlCase } from "@/lib/aml/amlCasesApi";
import { amlTenantApi, type AmlActivationProgram } from "@/lib/aml/amlTenantApi";
import { toast } from "@/hooks/use-toast";

/**
 * Phase 3 — Activate Client for AML dialog.
 *
 * Enforces the "human-confirmed activation event" rule from AGENTS.md §2.
 * Model B is disabled in the UI until the tenant records legal approval +
 * a program version. Server enforces the same guardrail regardless.
 */
export interface ActivateClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional prefill when launched from a specific client. */
  clientId?: string;
  clientName?: string;
  onActivated?: (aCase: AmlCase) => void;
}

export function ActivateClientDialog({
  open, onOpenChange, clientId, clientName, onActivated,
}: ActivateClientDialogProps) {
  const [clientIdInput, setClientIdInput] = useState(clientId ?? "");
  const [displayName, setDisplayName] = useState(clientName ?? "");
  const [subjectType, setSubjectType] = useState<"individual" | "entity" | "trust">("individual");
  const [model, setModel] = useState<"A" | "B">("A");
  const [event, setEvent] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const [program, setProgram] = useState<AmlActivationProgram | null>(null);
  const [loadingProgram, setLoadingProgram] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const modelBReady = Boolean(program?.legal_approval && program?.program_version?.trim());

  useEffect(() => {
    if (!open) return;
    setClientIdInput(clientId ?? "");
    setDisplayName(clientName ?? "");
    setSubjectType("individual");
    setModel("A");
    setEvent("");
    setReason("");
    setConfirmed(false);

    let alive = true;
    setLoadingProgram(true);
    amlTenantApi.getActivationProgram()
      .then((p) => { if (alive) setProgram(p); })
      .catch(() => { if (alive) setProgram(null); })
      .finally(() => { if (alive) setLoadingProgram(false); });
    return () => { alive = false; };
  }, [open, clientId, clientName]);

  const canSubmit =
    !!clientIdInput.trim() &&
    /^[0-9a-f-]{36}$/i.test(clientIdInput.trim()) &&
    !!displayName.trim() &&
    !!event.trim() &&
    reason.trim().length >= 10 &&
    confirmed &&
    (model === "A" || modelBReady);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { case: created } = await amlCasesApi.activateClient({
        client_id: clientIdInput.trim(),
        subject_display_name: displayName.trim(),
        subject_type: subjectType,
        activation_model: model,
        activation_event: event.trim(),
        reason: reason.trim(),
        human_confirmed: true,
      });
      toast({
        title: "Client activated for AML",
        description: `${created.case_reference} opened (Model ${model}).`,
      });
      onActivated?.(created);
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "Activation failed",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Activate client for AML/CTF
          </DialogTitle>
          <DialogDescription>
            Cases open only for real, active clients after a human-confirmed
            activation event. Marketing leads never auto-generate a case.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ac-client-id">Client ID (UUID)</Label>
              <Input
                id="ac-client-id"
                value={clientIdInput}
                onChange={(e) => setClientIdInput(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                disabled={!!clientId}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ac-name">Subject display name</Label>
              <Input
                id="ac-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Full legal name"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Subject type</Label>
              <Select value={subjectType} onValueChange={(v: any) => setSubjectType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="entity">Entity</SelectItem>
                  <SelectItem value="trust">Trust</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Activation model</Label>
              <Select value={model} onValueChange={(v: any) => setModel(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Model A — designated service triggered</SelectItem>
                  <SelectItem value="B" disabled={!modelBReady}>
                    Model B — pre-service {modelBReady ? "" : "(disabled)"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {model === "B" && !modelBReady && !loadingProgram && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Model B is not approved for this tenant</AlertTitle>
              <AlertDescription>
                An MLRO must record legal approval and a program version in
                Configuration before Model B can be used. Switch to Model A
                or complete the program setup first.
              </AlertDescription>
            </Alert>
          )}

          {model === "B" && modelBReady && (
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>Model B — program v{program?.program_version}</AlertTitle>
              <AlertDescription>
                Legal approval recorded{program?.approved_at ? ` on ${new Date(program.approved_at).toLocaleDateString()}` : ""}.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ac-event">Activation event</Label>
            <Input
              id="ac-event"
              value={event}
              onChange={(e) => setEvent(e.target.value)}
              placeholder="e.g. Signed engagement letter · Executed agency agreement"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ac-reason">Reason & evidence (min 10 chars)</Label>
            <Textarea
              id="ac-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Describe the trigger, evidence source and why AML activation is warranted."
            />
          </div>

          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(Boolean(v))}
              className="mt-0.5"
            />
            <span className="text-muted-foreground">
              I confirm this activation event has occurred and the client is a
              real active client. I understand a tamper-evident audit record
              will be written.
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Activate client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
