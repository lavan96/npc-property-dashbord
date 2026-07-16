import { useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { AmlCapability } from "@/lib/aml/permissions";

interface StepUpAuthDialogProps {
  open: boolean;
  capability: AmlCapability;
  onCancel: () => void;
  onConfirm: () => void;
}

const CAPABILITY_LABELS: Record<AmlCapability, string> = {
  "aml.view": "View AML surface",
  "aml.investigate": "Investigate AML case",
  "aml.report": "Lodge AUSTRAC report",
  "aml.configure": "Change AML configuration",
};

/**
 * Phase 2 placeholder step-up prompt.
 *
 * Real TOTP / WebAuthn / passkey is delivered in Phase 13.
 * For now we simply require the user to re-type the word CONFIRM so the
 * intent is deliberate and auditable at the UI layer.
 */
export function StepUpAuthDialog({ open, capability, onCancel, onConfirm }: StepUpAuthDialogProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const label = CAPABILITY_LABELS[capability] ?? capability;
  const isMatch = value.trim().toUpperCase() === "CONFIRM";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setValue(""); onCancel(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <DialogTitle>Step-up required</DialogTitle>
          </div>
          <DialogDescription>
            This action is restricted: <span className="font-medium">{label}</span>. Confirm your
            intent to continue. A stronger step-up (TOTP / passkey) will replace this prompt in a
            later phase.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <AlertDescription>
            Type <code className="font-mono font-semibold">CONFIRM</code> below and press Continue.
            This confirmation is scoped to your session for 30&nbsp;minutes and will be recorded to
            the AML audit chain on every action you take.
          </AlertDescription>
        </Alert>

        <div className="space-y-2 pt-2">
          <Label htmlFor="aml-step-up">Confirmation phrase</Label>
          <Input
            id="aml-step-up"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="CONFIRM"
            aria-invalid={value.length > 0 && !isMatch}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => { setValue(""); onCancel(); }} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={!isMatch || busy}
            onClick={() => {
              setBusy(true);
              // Give the UI a beat so the user sees the confirmation registered.
              setTimeout(() => {
                setBusy(false);
                setValue("");
                onConfirm();
              }, 150);
            }}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
