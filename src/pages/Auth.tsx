import { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useWhiteLabel } from '@/contexts/WhiteLabelContext';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { logActivityDirect } from '@/hooks/useActivityLogger';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Database, Loader2, Mail, ArrowLeft, ShieldCheck, Eye, EyeOff, KeyRound,
  AlertCircle, CheckCircle, BarChart3, Users, Zap,
} from 'lucide-react';
import { validatePassword } from '@/utils/passwordValidation';
import { PasswordStrengthMeter } from '@/components/ui/password-strength-meter';
import { TurnstileWidget } from '@/components/auth/TurnstileWidget';
import { OtpInput } from '@/components/finance-portal/OtpInput';
import { motion, AnimatePresence } from 'framer-motion';
import { BrandLockup, BrandLogo } from '@/components/branding/BrandAssets';
import { ManageDevicesDialog } from '@/components/auth/ManageDevicesDialog';
import type { DeviceLimitInfo } from '@/hooks/useAuth';

const FEATURES = [
  { icon: BarChart3, title: 'Analytics & Reports', desc: 'Investment reports, market intelligence, and portfolio analytics.' },
  { icon: Users, title: 'Client Management', desc: 'Complete CRM with deal tracking, pipelines, and automation.' },
  { icon: Zap, title: 'AI-Powered Workflows', desc: 'Intelligent agent, automated tasks, and smart recommendations.' },
];

type Mode = 'login' | 'forgot' | 'otp' | 'reset';

const formVariants = {
  enter: { opacity: 0, x: 24 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
};

export default function Auth() {
  const { signIn, user, loading } = useAuth();
  const { settings } = useWhiteLabel();
  const navigate = useNavigate();
  const formRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [emailHint, setEmailHint] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const clearTurnstileToken = useCallback(() => setTurnstileToken(null), []);

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" role="status" aria-label="Loading authentication">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
          <div className="flex flex-col items-center gap-3">
            {settings.authLogo ? (
              <BrandLogo slot="auth" className="h-12 max-w-[200px] object-contain" fallbackClassName="h-12 w-12" />
            ) : (
              <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Database className="h-6 w-6 text-primary" />
              </div>
            )}
            <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
            <span className="sr-only">Loading</span>
          </div>
        </motion.div>
      </div>
    );
  }

  const changeMode = (next: Mode) => {
    setMode(next);
    setError('');
    setSuccess('');
    setTimeout(() => {
      const firstInput = formRef.current?.querySelector<HTMLInputElement>('input:not([type=hidden])');
      firstInput?.focus();
    }, 250);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!turnstileToken) { setError('Please complete the security check'); return; }
    setIsLoading(true);
    const result = await signIn(username, password, turnstileToken);
    if (result.error) { setTurnstileToken(null); setError(result.error); }
    else navigate('/', { replace: true });
    setIsLoading(false);
  };

  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const { data } = await invokeSecureFunction('admin-password-reset', { action: 'request_otp', username });
      if (data?.success) {
        setEmailHint(data.email_hint || '');
        changeMode('otp');
        logActivityDirect({
          actionType: 'password_reset_initiated',
          entityType: 'user',
          entityName: username,
          metadata: { email_hint: data.email_hint },
        });
      } else {
        setError(data?.error || 'Failed to send OTP');
      }
    } catch {
      setError('Failed to send OTP');
    }
    setIsLoading(false);
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const { data } = await invokeSecureFunction('admin-password-reset', { action: 'verify_otp', username, otp });
      if (data?.success) changeMode('reset');
      else setError(data?.error || 'Invalid OTP');
    } catch {
      setError('Failed to verify OTP');
    }
    setIsLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    const validation = validatePassword(newPassword);
    if (!validation.isValid) { setError(validation.error || 'Password does not meet requirements'); return; }
    setError('');
    setIsLoading(true);
    try {
      const { data } = await invokeSecureFunction('admin-password-reset', { action: 'reset_password', username, otp, new_password: newPassword });
      if (data?.success) {
        setSuccess('Password reset successful! Please login.');
        setTimeout(() => { changeMode('login'); setOtp(''); setNewPassword(''); setConfirmPassword(''); }, 2000);
      } else {
        setError(data?.error || 'Failed to reset password');
      }
    } catch {
      setError('Failed to reset password');
    }
    setIsLoading(false);
  };

  const modeTitle: Record<Mode, string> = {
    login: settings.companyName ? `${settings.companyName} Dashboard` : 'Command Centre',
    forgot: 'Reset password',
    otp: 'Verify your identity',
    reset: 'New password',
  };

  const modeDesc: Record<Mode, string> = {
    login: 'Sign in to access the dashboard.',
    forgot: 'Enter your username to receive a reset code.',
    otp: emailHint ? `Enter the code sent to ${emailHint}` : 'Enter the 6-digit code we sent you.',
    reset: 'Choose a new secure password.',
  };

  const goBack = () => {
    if (mode === 'otp' || mode === 'reset') changeMode('forgot');
    else changeMode('login');
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* ── Left branded panel (desktop only) ── */}
      <aside className="hidden lg:flex lg:w-[480px] xl:w-[520px] flex-col relative bg-gradient-to-br from-card via-card to-primary/5 border-r border-border overflow-hidden" aria-hidden="true">
        <div className="absolute top-0 right-0 w-[2px] h-full bg-gradient-to-b from-transparent via-primary/30 to-transparent" />
        <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-32 -right-16 w-80 h-80 rounded-full bg-primary/5 blur-3xl" />

        <div className="flex-1 flex flex-col justify-between p-10 relative">
          <div>
            <BrandLockup
              slot="auth"
              meta="Command Centre"
              logoClassName="h-12 max-w-[220px] object-contain"
              fallbackClassName="h-11 w-11 border border-primary/20"
              companyClassName="text-lg font-bold tracking-tight"
              metaClassName="tracking-[0.2em]"
            />
          </div>

          <div className="space-y-8">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground leading-tight">
                Intelligence-driven<br />
                property <span className="text-primary">advisory</span>.
              </h2>
              <p className="text-muted-foreground mt-3 text-sm leading-relaxed max-w-sm">
                Your centralised command centre for client management, investment analytics, automated workflows, and deal orchestration.
              </p>
            </div>

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

          <div className="text-[10px] text-muted-foreground/40 flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3" />
            <span>Secured platform · End-to-end encrypted · Audit logged</span>
          </div>
        </div>
      </aside>

      {/* ── Right form panel ── */}
      <main className="flex-1 flex items-center justify-center p-6 md:p-10" role="main" aria-label="Dashboard authentication">
        <motion.div
          className="w-full max-w-sm"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            {settings.authLogo ? (
              <img src={settings.authLogo} alt={settings.companyName || 'Dashboard'} className="h-14 max-w-[220px] object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Database className="h-7 w-7 text-primary" aria-hidden="true" />
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold tracking-tight">{settings.companyName || 'Dashboard'}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-medium">Command Centre</div>
                </div>
              </div>
            )}
          </div>

          {/* Header */}
          <div className="mb-6">
            {mode !== 'login' && (
              <button
                type="button"
                onClick={goBack}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1 py-0.5"
                aria-label={`Back to ${mode === 'otp' || mode === 'reset' ? 'forgot password' : 'sign in'}`}
              >
                <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                Back
              </button>
            )}
            <h1 className="text-2xl font-bold tracking-tight" id="form-heading">{modeTitle[mode]}</h1>
            <p className="text-sm text-muted-foreground mt-1" id="form-description">{modeDesc[mode]}</p>
          </div>

          {/* Status messages */}
          {error && (
            <Alert variant="destructive" className="mb-4" role="alert">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert className="mb-4 border-success" role="status">
              <CheckCircle className="h-4 w-4 text-success" aria-hidden="true" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          {/* Animated form swap */}
          <div ref={formRef}>
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
                  <form onSubmit={handleLogin} className="space-y-4" aria-labelledby="form-heading" aria-describedby="form-description">
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-username" className="text-xs font-medium">Username</Label>
                      <Input
                        id="admin-username"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        placeholder="Enter your username"
                        autoComplete="username"
                        required
                        disabled={isLoading}
                        className="h-11"
                        aria-required="true"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-password" className="text-xs font-medium">Password</Label>
                      <div className="relative">
                        <Input
                          id="admin-password"
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          autoComplete="current-password"
                          required
                          disabled={isLoading}
                          className="h-11 pr-10"
                          aria-required="true"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                        </button>
                      </div>
                    </div>
                    <TurnstileWidget onVerify={setTurnstileToken} onExpire={clearTurnstileToken} onError={clearTurnstileToken} />
                    <Button type="submit" className="w-full h-11 gap-2 font-semibold" disabled={isLoading || !turnstileToken} aria-busy={isLoading}>
                      {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      Sign In
                    </Button>
                    <div className="text-center">
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1 py-0.5"
                        onClick={() => changeMode('forgot')}
                        aria-label="Forgot your password? Request a reset code"
                      >
                        Forgot password?
                      </button>
                    </div>
                  </form>
                )}

                {mode === 'forgot' && (
                  <form onSubmit={handleRequestOTP} className="space-y-4" aria-labelledby="form-heading" aria-describedby="form-description">
                    <div className="space-y-1.5">
                      <Label htmlFor="forgot-admin-username" className="text-xs font-medium">Username</Label>
                      <Input
                        id="forgot-admin-username"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        placeholder="Enter your username"
                        required
                        disabled={isLoading}
                        className="h-11"
                        aria-required="true"
                      />
                    </div>
                    <Button type="submit" className="w-full h-11 gap-2 font-semibold" disabled={isLoading} aria-busy={isLoading}>
                      {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      <Mail className="h-4 w-4" aria-hidden="true" /> Send Reset Code
                    </Button>
                  </form>
                )}

                {mode === 'otp' && (
                  <form onSubmit={handleVerifyOTP} className="space-y-5" aria-labelledby="form-heading" aria-describedby="form-description">
                    <div className="space-y-3">
                      <Label className="text-xs font-medium block text-center">Verification code</Label>
                      <OtpInput value={otp} onChange={setOtp} length={6} disabled={isLoading} />
                      {emailHint && (
                        <p className="text-xs text-muted-foreground text-center" aria-live="polite">
                          Sent to <span className="font-medium text-foreground">{emailHint}</span>
                        </p>
                      )}
                    </div>
                    <Button type="submit" className="w-full h-11 gap-2 font-semibold" disabled={otp.length !== 6 || isLoading} aria-busy={isLoading}>
                      {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      <KeyRound className="h-4 w-4" aria-hidden="true" /> Verify Code
                    </Button>
                  </form>
                )}

                {mode === 'reset' && (
                  <form onSubmit={handleResetPassword} className="space-y-4" aria-labelledby="form-heading" aria-describedby="form-description">
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-new-password" className="text-xs font-medium">New password</Label>
                      <div className="relative">
                        <Input
                          id="admin-new-password"
                          type={showNewPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          className="h-11 pr-10"
                          required
                          disabled={isLoading}
                          autoFocus
                          aria-required="true"
                          aria-describedby="admin-pw-strength"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                        >
                          {showNewPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                        </button>
                      </div>
                      <div id="admin-pw-strength">
                        <PasswordStrengthMeter password={newPassword} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-confirm-password" className="text-xs font-medium">Confirm password</Label>
                      <div className="relative">
                        <Input
                          id="admin-confirm-password"
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={e => setConfirmPassword(e.target.value)}
                          className="h-11 pr-10"
                          required
                          disabled={isLoading}
                          aria-required="true"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                        >
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                        </button>
                      </div>
                    </div>
                    <Button type="submit" className="w-full h-11 gap-2 font-semibold" disabled={isLoading} aria-busy={isLoading}>
                      {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      Reset Password
                    </Button>
                  </form>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Bottom security note (mobile) */}
          <div className="lg:hidden mt-8 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground/40">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            <span>Secured · End-to-end encrypted</span>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
