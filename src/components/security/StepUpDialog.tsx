/**
 * WP-11C — Step-up (recent reauthentication) dialog.
 *
 * Opens a password prompt bound to a capability, issues a short-lived
 * step-up token via `security-step-up`, and stores it in sessionStorage.
 * Sensitive edge-function callers pass `{ stepUpCapability }` to
 * `invokeSecureFunction` which attaches the token automatically.
 */
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { requestStepUpChallenge, type StepUpCapability } from '@/lib/security/stepUp';

interface StepUpDialogProps {
  open: boolean;
  capability: StepUpCapability | string;
  title?: string;
  description?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const CAP_LABEL: Record<string, string> = {
  'role.change': 'Assign a role',
  'role.remove': 'Remove a role',
  'aml.role.set': 'Change AML compliance roles',
  'secrets.update': 'Rotate integration secrets',
  'commission.payout.generate': 'Generate a commission payout',
  'commission.payout.mark_paid': 'Mark a payout as paid',
  'docusign.send': 'Send a DocuSign envelope',
  'docusign.void': 'Void a DocuSign envelope',
  'storage.destructive': 'Delete stored files',
};

export function StepUpDialog({
  open, capability, title, description, onSuccess, onCancel,
}: StepUpDialogProps) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const humanCap = CAP_LABEL[capability] ?? capability;

  const handleConfirm = async () => {
    if (!password) { setError('Enter your current password'); return; }
    setBusy(true);
    setError(null);
    const result = await requestStepUpChallenge(capability, password);
    setBusy(false);
    if (!result.ok) {
      const err = (result as { ok: false; error: string }).error;
      setError(
        err === 'invalid_credentials' ? 'Incorrect password.' :
        err === 'mfa_enrollment_required' ? 'MFA enrolment is required for this account.' :
        err || 'Verification failed.',
      );
      return;
    }
    setPassword('');
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <DialogTitle>{title ?? 'Confirm your identity'}</DialogTitle>
          </div>
          <DialogDescription>
            {description ?? `Re-enter your password to authorise: ${humanCap}. This authorisation is valid for 15 minutes.`}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="stepup-password">Password</Label>
          <Input
            id="stepup-password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !busy) handleConfirm(); }}
            disabled={busy}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={busy || !password}>
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying…</> : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Simple hook that returns a `guard(capability)` fn resolving true when a
 * live token exists, otherwise showing the dialog and awaiting the outcome.
 */
import { useCallback, useRef } from 'react';
import { getStepUpToken } from '@/lib/security/stepUp';

export function useStepUp() {
  const [state, setState] = useState<{ open: boolean; capability: string }>({ open: false, capability: '' });
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const guard = useCallback((capability: StepUpCapability | string): Promise<boolean> => {
    if (getStepUpToken(capability)) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState({ open: true, capability });
    });
  }, []);

  const element = (
    <StepUpDialog
      open={state.open}
      capability={state.capability}
      onSuccess={() => { setState({ open: false, capability: '' }); resolverRef.current?.(true); resolverRef.current = null; }}
      onCancel={() => { setState({ open: false, capability: '' }); resolverRef.current?.(false); resolverRef.current = null; }}
    />
  );

  return { guard, element };
}
