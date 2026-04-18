import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const SUPABASE_URL = "https://dduzbchuswwbefdunfct.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkdXpiY2h1c3d3YmVmZHVuZmN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0NDM4NzksImV4cCI6MjA3MTAxOTg3OX0.eSYU6fxIc3tBQuGLsdBRff0alBMkNfvv7OpW0efNjxk";

async function callPublic(fn: string, body: any) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  return { ok: r.ok, data };
}

export default function FinancePortalAcceptInvite() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const [stage, setStage] = useState<'loading' | 'set_password' | 'done' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [email, setEmail] = useState('');
  const [contactName, setContactName] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      if (!token) { setStage('error'); setErrorMsg('Missing invite token'); return; }
      const { ok, data } = await callPublic('finance-portal-accept-invite', { action: 'validate', token });
      if (!ok || !data?.valid) {
        setStage('error');
        setErrorMsg(data?.error || 'This invite link is invalid or has expired.');
        return;
      }
      setEmail(data.email || '');
      setContactName(data.name || '');
      setStage('set_password');
    })();
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 10) return toast.error('Password must be at least 10 characters');
    if (pw !== pw2) return toast.error('Passwords do not match');
    setSubmitting(true);
    const { ok, data } = await callPublic('finance-portal-accept-invite', {
      action: 'accept', token, password: pw,
    });
    setSubmitting(false);
    if (!ok || !data?.success) {
      toast.error(data?.error || 'Failed to set password');
      return;
    }
    toast.success('Password set. You can now sign in.');
    setStage('done');
    setTimeout(() => navigate('/finance/login', { replace: true }), 1500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4">
      <Card className="w-full max-w-md shadow-xl border-primary/10">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Building2 className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-2xl">Finance Portal Invitation</CardTitle>
          <CardDescription>
            {stage === 'loading' && 'Validating your invite...'}
            {stage === 'set_password' && `Welcome ${contactName || ''}. Choose a password to activate your account.`}
            {stage === 'done' && 'Account activated.'}
            {stage === 'error' && 'There is a problem with this invite.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stage === 'loading' && <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin" /></div>}
          {stage === 'error' && (
            <div className="text-center space-y-3">
              <p className="text-sm text-destructive">{errorMsg}</p>
              <Button variant="outline" onClick={() => navigate('/finance/login')}>Go to Login</Button>
            </div>
          )}
          {stage === 'done' && (
            <div className="text-center space-y-3">
              <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
              <p className="text-sm text-muted-foreground">Redirecting you to sign in...</p>
            </div>
          )}
          {stage === 'set_password' && (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label>Email</Label>
                <Input value={email} disabled className="mt-1 bg-muted" />
              </div>
              <div>
                <Label>New password</Label>
                <Input type="password" value={pw} onChange={e => setPw(e.target.value)} minLength={10} className="mt-1" required />
                <div className="text-xs text-muted-foreground mt-1">Minimum 10 characters.</div>
              </div>
              <div>
                <Label>Confirm password</Label>
                <Input type="password" value={pw2} onChange={e => setPw2(e.target.value)} minLength={10} className="mt-1" required />
              </div>
              <Button type="submit" className="w-full gap-2" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Activate Account
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
