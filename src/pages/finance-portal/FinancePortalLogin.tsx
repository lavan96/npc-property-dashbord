import { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { AlertCircle, ArrowLeft, CheckCircle, Eye, EyeOff, Building2, Loader2 } from 'lucide-react';
import { validatePassword } from '@/utils/passwordValidation';
import { PasswordStrengthMeter } from '@/components/ui/password-strength-meter';
import { TurnstileWidget } from '@/components/auth/TurnstileWidget';

type View = 'login' | 'forgot' | 'otp' | 'reset';

export default function FinancePortalLogin() {
  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const clearTurnstileToken = useCallback(() => setTurnstileToken(null), []);
  const { signIn, user, loading, requestPasswordReset, verifyOTP, resetPassword } = useFinancePortalAuth();
  const navigate = useNavigate();

  if (user) {
    navigate('/finance', { replace: true });
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground text-sm">Loading Finance Portal...</p>
        </div>
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!turnstileToken) {
      setError('Please complete the security check');
      return;
    }
    setIsLoading(true);
    const result = await signIn(email, password, turnstileToken);
    if (result.error) {
      setTurnstileToken(null);
      setError(result.error);
    } else {
      navigate('/finance', { replace: true });
    }
    setIsLoading(false);
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    const result = await requestPasswordReset(email);
    if (result.error) {
      setError(result.error);
    } else {
      setView('otp');
      setSuccess('If an account exists with this email, a reset code has been sent.');
    }
    setIsLoading(false);
  };

  const handleVerifyOTP = async () => {
    setError('');
    setIsLoading(true);
    const result = await verifyOTP(email, otp);
    if (result.error) {
      setError(result.error);
    } else {
      setView('reset');
      setSuccess('');
    }
    setIsLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    const validation = validatePassword(newPassword);
    if (!validation.isValid) {
      setError(validation.error || 'Password does not meet requirements');
      return;
    }
    setError('');
    setIsLoading(true);
    const result = await resetPassword(email, otp, newPassword);
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess('Password reset successful! Please sign in.');
      setTimeout(() => { setView('login'); setSuccess(''); setOtp(''); setNewPassword(''); setConfirmPassword(''); }, 2000);
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="space-y-2 text-center">
          <div className="flex justify-center mb-2">
            <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">
            {view === 'login' && 'Finance Portal'}
            {view === 'forgot' && 'Reset Password'}
            {view === 'otp' && 'Enter Reset Code'}
            {view === 'reset' && 'New Password'}
          </CardTitle>
          <CardDescription>
            {view === 'login' && 'Secure access for finance partners and brokers'}
            {view === 'forgot' && 'Enter your email to receive a reset code'}
            {view === 'otp' && 'Enter the 6-digit code sent to your email'}
            {view === 'reset' && 'Choose a strong new password'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert className="mb-4 border-green-500/40 bg-green-500/5">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          {view === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email" type="email" autoComplete="email"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@firm.com" required disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password" required disabled={isLoading} className="pr-10"
                  />
                  <Button
                    type="button" variant="ghost" size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)} tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                </div>
              </div>
              <TurnstileWidget
                onVerify={setTurnstileToken}
                onExpire={clearTurnstileToken}
                onError={clearTurnstileToken}
              />
              <Button type="submit" className="w-full" disabled={isLoading || !turnstileToken}>
                {isLoading ? 'Signing in...' : 'Sign In'}
              </Button>
              <Button
                type="button" variant="link" className="w-full"
                onClick={() => { setView('forgot'); setError(''); setSuccess(''); }}
              >
                Forgot password?
              </Button>
            </form>
          )}

          {view === 'forgot' && (
            <form onSubmit={handleRequestReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email" type="email"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@firm.com" required disabled={isLoading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Sending...' : 'Send Reset Code'}
              </Button>
              <Button
                type="button" variant="ghost" className="w-full"
                onClick={() => { setView('login'); setError(''); setSuccess(''); }}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />Back to login
              </Button>
            </form>
          )}

          {view === 'otp' && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <Button className="w-full" onClick={handleVerifyOTP} disabled={otp.length !== 6 || isLoading}>
                {isLoading ? 'Verifying...' : 'Verify Code'}
              </Button>
              <Button
                type="button" variant="ghost" className="w-full"
                onClick={() => { setView('forgot'); setError(''); setSuccess(''); }}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />Back
              </Button>
            </div>
          )}

          {view === 'reset' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Input
                    id="new-password" type={showNewPassword ? 'text' : 'password'}
                    value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password" required disabled={isLoading} className="pr-10"
                  />
                  <Button
                    type="button" variant="ghost" size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowNewPassword(!showNewPassword)} tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                </div>
                <PasswordStrengthMeter password={newPassword} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirm-password" type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password" required disabled={isLoading} className="pr-10"
                  />
                  <Button
                    type="button" variant="ghost" size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)} tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Resetting...' : 'Reset Password'}
              </Button>
            </form>
          )}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Are you a client? <Link to="/client/login" className="text-primary hover:underline">Use the client portal</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
