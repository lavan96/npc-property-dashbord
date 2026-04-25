import { useState } from 'react';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { useBrand } from '@/branding/useBrand';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { ShieldCheck, Users, Lock, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const buildTermsBody = (brand: string) => `
By accessing the Finance Partner Portal you agree to:

1. Confidentiality. All client information accessible through this portal is strictly confidential. You will not disclose, reproduce, or distribute any client data outside the scope of your engagement with ${brand}.

2. Authorised Use. You will only access records for clients you have been explicitly assigned to. Attempting to access unassigned clients is a breach of this agreement.

3. Data Accuracy. Any updates you make to a client's financial profile must reflect documents and information provided to you by that client. You will retain supporting evidence for 7 years.

4. Security. You will keep your login credentials private, enable strong passwords, and immediately notify ${brand} if you suspect compromise.

5. Audit. All actions you perform in this portal (logins, views, edits, deletions, document uploads, messages) are logged and may be reviewed by ${brand} compliance.

6. Compliance. You will comply with the Privacy Act 1988, the Australian Privacy Principles, NCCP Act obligations (where applicable), and any AML/CTF requirements.

7. Termination. ${brand} may revoke your access at any time without notice if a breach is suspected.

8. Indemnity. You indemnify ${brand} against losses arising from your misuse of the portal or any breach of these terms.

This agreement is governed by the laws of New South Wales, Australia.
`;

const buildWizardSteps = (brand: string) => [
  {
    icon: ShieldCheck,
    title: 'Welcome to the Finance Partner Portal',
    body: `A purpose-built workspace where you can manage the financial profiles of clients ${brand} has assigned to you. Everything you see here is gated by per-client permissions set by ${brand}.`,
  },
  {
    icon: Users,
    title: 'Per-client access',
    body: `Your client list shows only the clients you have been assigned. Inside each client you may see Properties, Income, Expenses, Assets, Liabilities, Employment, Address History, Notes and Contacts depending on the access ${brand} has granted.`,
  },
  {
    icon: Lock,
    title: 'View, Edit, Delete — clearly labelled',
    body: 'Each section displays your access level. If a button is missing, your assignment does not include that permission. Need different access? Contact your account manager.',
  },
];

export function FinancePortalOnboardingGate() {
  const { user, acceptTerms, completeOnboarding } = useFinancePortalAuth();
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);

  if (!user) return null;

  const showTerms = !user.has_accepted_terms;
  const showWizard = user.has_accepted_terms && !user.has_completed_onboarding;

  if (!showTerms && !showWizard) return null;

  const handleAccept = async () => {
    if (!agreed) return;
    setSubmitting(true);
    try {
      await acceptTerms();
      setWizardStep(0);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to accept terms. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = async () => {
    if (wizardStep < WIZARD_STEPS.length - 1) {
      setWizardStep(s => s + 1);
      return;
    }
    setSubmitting(true);
    try {
      await completeOnboarding();
      toast.success('Welcome aboard. You are all set.');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to complete onboarding.');
    } finally {
      setSubmitting(false);
    }
  };

  if (showTerms) {
    return (
      <Dialog open onOpenChange={() => { /* blocking */ }}>
        <DialogContent className="max-w-2xl" onPointerDownOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Finance Partner Portal — Terms of Use
            </DialogTitle>
            <DialogDescription>
              Please read and accept the terms below before proceeding.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-72 rounded-md border bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-line">
            {TERMS_BODY}
          </ScrollArea>
          <div className="flex items-start gap-3 rounded-md border bg-card p-3">
            <Checkbox id="terms-agree" checked={agreed} onCheckedChange={v => setAgreed(!!v)} />
            <label htmlFor="terms-agree" className="text-sm leading-snug cursor-pointer select-none">
              I have read and agree to the Finance Partner Portal terms of use, including confidentiality, authorised use, security, audit and compliance obligations.
            </label>
          </div>
          <DialogFooter>
            <Button onClick={handleAccept} disabled={!agreed || submitting} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Accept & Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Wizard
  const step = WIZARD_STEPS[wizardStep];
  const Icon = step.icon;
  const isLast = wizardStep === WIZARD_STEPS.length - 1;
  return (
    <Dialog open onOpenChange={() => { /* blocking */ }}>
      <DialogContent className="max-w-lg" onPointerDownOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mx-auto mb-2">
            <Icon className="h-7 w-7 text-primary" />
          </div>
          <DialogTitle className="text-center">{step.title}</DialogTitle>
          <DialogDescription className="text-center text-base leading-relaxed pt-2">
            {step.body}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-2 py-3">
          {WIZARD_STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === wizardStep ? 'w-8 bg-primary' : 'w-2 bg-muted'
              }`}
            />
          ))}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => setWizardStep(s => Math.max(0, s - 1))}
            disabled={wizardStep === 0 || submitting}
          >
            Back
          </Button>
          <Button onClick={handleNext} disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isLast ? <><Sparkles className="h-4 w-4" /> Get Started</> : 'Next'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
