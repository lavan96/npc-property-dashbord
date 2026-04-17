import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

// Turnstile global is declared elsewhere in the project

export default function FinancePortalLogin() {
  const { user, signIn, requestPasswordReset, verifyOTP, resetPassword, loading } = useFinancePortalAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'login' | 'forgot' | 'verify' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);

  // Load Turnstile script
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || mode !== 'login') return;
    if (window.turnstile && turnstileRef.current) {
      try {
        window.turnstile.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => setTurnstileToken(token),
          theme: 'auto',
        });
        return;
      } catch { /* ignore */ }
    }
    const existing = document.querySelector('script[data-turnstile]');
    if (existing) return;
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true;
    s.defer = true;
    s.setAttribute('data-turnstile', 'true');
    s.onload = () => {
      if (window.turnstile && turnstileRef.current) {
        try {
          window.turnstile.render(turnstileRef.current, {
            sitekey: TURNSTILE_SITE_KEY,
            callback: (token: string) => setTurnstileToken(token),
            theme: 'auto',
          });
        } catch { /* ignore */ }
      }
    };
    document.head.appendChild(s);
  }, [mode]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) return <Navigate to="/finance" replace />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return toast.error('Email and password required');
    if (TURNSTILE_SITE_KEY && !turnstileToken) return toast.error('Please complete the security check');
    setSubmitting(true);
    try {
      const { error } = await signIn(email, password, turnstileToken || undefined);
      if (error) {
        toast.error(error);
        if (window.turnstile && turnstileRef.current) try { window.turnstile.reset(turnstileRef.current.id || ''); } catch {}
        setTurnstileToken(null);
      } else {
        navigate('/finance', { replace: true });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return toast.error('Email required');
    setSubmitting(true);
    try {
      const { error } = await requestPasswordReset(email);
      if (error) toast.error(error);
      else { toast.success('If that email exists, a code has been sent.'); setMode('verify'); }
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) return toast.error('Enter the 6-digit code');
    setSubmitting(true);
    try {
      const { error } = await verifyOTP(email, otp);
      if (error) toast.error(error);
      else setMode('reset');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 10) return toast.error('Password must be at least 10 characters');
    setSubmitting(true);
    try {
      const { error } = await resetPassword(email, otp, newPassword);
      if (error) toast.error(error);
      else { toast.success('Password reset. Please sign in.'); setMode('login'); setPassword(''); setOtp(''); setNewPassword(''); }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4">
      <Card className="w-full max-w-md shadow-xl border-primary/10">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Building2 className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-2xl">Finance Partner Portal</CardTitle>
          <CardDescription>
            {mode === 'login' && 'Sign in to manage your assigned clients.'}
            {mode === 'forgot' && 'Enter your email to receive a reset code.'}
            {mode === 'verify' && 'Enter the 6-digit code we emailed you.'}
            {mode === 'reset' && 'Choose a new password.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label>Email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1" autoComplete="email" required />
              </div>
              <div>
                <Label>Password</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1" autoComplete="current-password" required />
              </div>
              {TURNSTILE_SITE_KEY && (
                <div ref={turnstileRef} className="flex justify-center" />
              )}
              <Button type="submit" className="w-full gap-2" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Sign In
              </Button>
              <div className="text-center text-sm">
                <button type="button" className="text-primary hover:underline" onClick={() => setMode('forgot')}>
                  Forgot password?
                </button>
              </div>
            </form>
          )}
          {mode === 'forgot' && (
            <form onSubmit={handleRequestReset} className="space-y-4">
              <div>
                <Label>Email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1" required />
              </div>
              <Button type="submit" className="w-full gap-2" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                <Mail className="h-4 w-4" /> Send Reset Code
              </Button>
              <div className="text-center text-sm">
                <button type="button" className="text-primary hover:underline" onClick={() => setMode('login')}>
                  Back to sign in
                </button>
              </div>
            </form>
          )}
          {mode === 'verify' && (
            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <Label>6-digit code</Label>
                <Input value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-1 text-center text-2xl tracking-widest" maxLength={6} required />
              </div>
              <Button type="submit" className="w-full gap-2" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Verify Code
              </Button>
            </form>
          )}
          {mode === 'reset' && (
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <Label>New password</Label>
                <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="mt-1" minLength={10} required />
                <div className="text-xs text-muted-foreground mt-1">Minimum 10 characters.</div>
              </div>
              <Button type="submit" className="w-full gap-2" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Set Password
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
