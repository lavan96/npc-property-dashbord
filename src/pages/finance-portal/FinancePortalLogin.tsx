import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Loader2, Mail, ArrowLeft, ShieldCheck, Users, Lock, KeyRound, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useWhiteLabel } from '@/contexts/WhiteLabelContext';
import { TurnstileWidget } from '@/components/auth/TurnstileWidget';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

const FEATURES = [
  { icon: Users, title: 'Client Management', desc: 'Access and manage assigned client financial profiles in real-time.' },
  { icon: ShieldCheck, title: 'Secure & Compliant', desc: 'End-to-end encryption with full audit trail on every action.' },
  { icon: Lock, title: 'Permission-based Access', desc: 'Granular per-client permissions controlled by NPC administrators.' },
];

type Mode = 'login' | 'forgot' | 'verify' | 'reset';

const formVariants = {
  enter: { opacity: 0, x: 24 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
};

export default function FinancePortalLogin() {
  const { user, signIn, requestPasswordReset, verifyOTP, resetPassword, loading } = useFinancePortalAuth();
  const { settings } = useWhiteLabel();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
          <div className="flex flex-col items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        </motion.div>
      </div>
    );
  }

  if (user) return <Navigate to="/finance" replace />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return toast.error('Email and password required');
    if (!turnstileToken) return toast.error('Please complete the security check');
    setSubmitting(true);
    try {
      const { error, mustChangePassword } = await signIn(email, password, turnstileToken || undefined);
      if (error) { toast.error(error); setTurnstileToken(null); }
      else if (mustChangePassword) navigate('/finance/change-password', { replace: true });
      else navigate('/finance', { replace: true });
    } finally { setSubmitting(false); }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return toast.error('Email required');
    setSubmitting(true);
    try {
      const { error } = await requestPasswordReset(email);
      if (error) toast.error(error);
      else { toast.success('If that email exists, a code has been sent.'); setMode('verify'); }
    } finally { setSubmitting(false); }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) return toast.error('Enter the 6-digit code');
    setSubmitting(true);
    try {
      const { error } = await verifyOTP(email, otp);
      if (error) toast.error(error);
      else setMode('reset');
    } finally { setSubmitting(false); }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 10) return toast.error('Password must be at least 10 characters');
    setSubmitting(true);
    try {
      const { error } = await resetPassword(email, otp, newPassword);
      if (error) toast.error(error);
      else { toast.success('Password reset. Please sign in.'); setMode('login'); setPassword(''); setOtp(''); setNewPassword(''); }
    } finally { setSubmitting(false); }
  };

  const modeTitle: Record<Mode, string> = {
    login: 'Welcome back',
    forgot: 'Reset password',
    verify: 'Verify your identity',
    reset: 'New password',
  };

  const modeDesc: Record<Mode, string> = {
    login: 'Sign in to manage your assigned clients.',
    forgot: 'Enter your email to receive a reset code.',
    verify: 'Enter the 6-digit code we emailed you.',
    reset: 'Choose a new secure password.',
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* ── Left branded panel (desktop only) ── */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[520px] flex-col relative bg-gradient-to-br from-card via-card to-primary/5 border-r border-border overflow-hidden">
        {/* Gold accent line */}
        <div className="absolute top-0 right-0 w-[2px] h-full bg-gradient-to-b from-transparent via-primary/30 to-transparent" />

        {/* Decorative circles */}
        <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-32 -right-16 w-80 h-80 rounded-full bg-primary/5 blur-3xl" />

        <div className="flex-1 flex flex-col justify-between p-10 relative">
          {/* Logo */}
          <div>
            {settings.authLogo ? (
              <img src={settings.authLogo} alt={settings.companyName} className="h-12 max-w-[220px] object-contain" />
            ) : (
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <div className="text-lg font-bold tracking-tight text-foreground">Finance Portal</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-medium">Partner Access</div>
                </div>
              </div>
            )}
          </div>

          {/* Hero text */}
          <div className="space-y-8">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground leading-tight">
                Manage client finances<br />
                with <span className="text-primary">confidence</span>.
              </h2>
              <p className="text-muted-foreground mt-3 text-sm leading-relaxed max-w-sm">
                Your secure workspace for client financial profiles, borrowing assessments, document management, and commission tracking.
              </p>
            </div>

            {/* Feature list */}
            <div className="space-y-4">
              {FEATURES.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 + i * 0.12 }}
                  className="flex items-start gap-3"
                >
                  <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-primary/10 text-primary shrink-0 mt-0.5">
                    <f.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">{f.title}</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">{f.desc}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="text-[10px] text-muted-foreground/40 flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3" />
            <span>Secured portal · End-to-end encrypted · Audit logged</span>
          </div>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-10">
        <motion.div
          className="w-full max-w-sm"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            {settings.authLogo ? (
              <img src={settings.authLogo} alt={settings.companyName} className="h-14 max-w-[220px] object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Building2 className="h-7 w-7 text-primary" />
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold tracking-tight">Finance Portal</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-medium">Partner Access</div>
                </div>
              </div>
            )}
          </div>

          {/* Header */}
          <div className="mb-6">
            {mode !== 'login' && (
              <button
                type="button"
                onClick={() => setMode(mode === 'verify' || mode === 'reset' ? 'forgot' : 'login')}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
              >
                <ArrowLeft className="h-3 w-3" />
                Back
              </button>
            )}
            <h1 className="text-2xl font-bold tracking-tight">{modeTitle[mode]}</h1>
            <p className="text-sm text-muted-foreground mt-1">{modeDesc[mode]}</p>
          </div>

          {/* Animated form swap */}
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              variants={formVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: 'easeInOut' }}
            >
              {mode === 'login' && (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Email</Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      autoComplete="email"
                      required
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Password</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                        className="h-11 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <TurnstileWidget
                    onVerify={(token) => setTurnstileToken(token)}
                    onExpire={() => setTurnstileToken(null)}
                    onError={() => setTurnstileToken(null)}
                  />
                  <Button type="submit" className="w-full h-11 gap-2 font-semibold" disabled={submitting}>
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Sign In
                  </Button>
                  <div className="text-center">
                    <button type="button" className="text-xs text-muted-foreground hover:text-primary transition-colors" onClick={() => setMode('forgot')}>
                      Forgot password?
                    </button>
                  </div>
                </form>
              )}

              {mode === 'forgot' && (
                <form onSubmit={handleRequestReset} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Email</Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      required
                      className="h-11"
                    />
                  </div>
                  <Button type="submit" className="w-full h-11 gap-2 font-semibold" disabled={submitting}>
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    <Mail className="h-4 w-4" /> Send Reset Code
                  </Button>
                </form>
              )}

              {mode === 'verify' && (
                <form onSubmit={handleVerify} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">6-digit code</Label>
                    <Input
                      value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="h-14 text-center text-2xl tracking-[0.3em] font-mono"
                      maxLength={6}
                      required
                      placeholder="000000"
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      Sent to <span className="font-medium text-foreground">{email}</span>
                    </p>
                  </div>
                  <Button type="submit" className="w-full h-11 gap-2 font-semibold" disabled={submitting}>
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    <KeyRound className="h-4 w-4" /> Verify Code
                  </Button>
                </form>
              )}

              {mode === 'reset' && (
                <form onSubmit={handleReset} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">New password</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        className="h-11 pr-10"
                        minLength={10}
                        required
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Minimum 10 characters.</p>
                  </div>
                  <Button type="submit" className="w-full h-11 gap-2 font-semibold" disabled={submitting}>
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Set Password
                  </Button>
                </form>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Bottom security note (mobile) */}
          <div className="lg:hidden mt-8 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground/40">
            <ShieldCheck className="h-3 w-3" />
            <span>Secured · End-to-end encrypted</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
