import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useWhiteLabel } from '@/contexts/WhiteLabelContext';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Database, AlertCircle, ArrowLeft, CheckCircle } from 'lucide-react';
import { validatePassword } from '@/utils/passwordValidation';
import { PasswordStrengthMeter } from '@/components/ui/password-strength-meter';

type AuthView = 'login' | 'forgot' | 'otp' | 'reset';

export default function Auth() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [emailHint, setEmailHint] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<AuthView>('login');
  
  const { signIn, user, loading } = useAuth();
  const { settings } = useWhiteLabel();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          {settings.authLogo ? (
            <img src={settings.authLogo} alt={settings.companyName} className="h-20 max-w-[280px] mx-auto object-contain animate-pulse" />
          ) : (
            <Database className="h-16 w-16 text-primary mx-auto animate-pulse" />
          )}
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    const result = await signIn(username, password);
    if (result.error) {
      setError(result.error);
    } else {
      navigate('/', { replace: true });
    }
    setIsLoading(false);
  };

  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const { data } = await invokeSecureFunction('admin-password-reset', {
        action: 'request_otp', username
      });
      if (data?.success) {
        setEmailHint(data.email_hint || '');
        setView('otp');
      } else {
        setError(data?.error || 'Failed to send OTP');
      }
    } catch {
      setError('Failed to send OTP');
    }
    setIsLoading(false);
  };

  const handleVerifyOTP = async () => {
    setError('');
    setIsLoading(true);
    try {
      const { data } = await invokeSecureFunction('admin-password-reset', {
        action: 'verify_otp', username, otp
      });
      if (data?.success) {
        setView('reset');
      } else {
        setError(data?.error || 'Invalid OTP');
      }
    } catch {
      setError('Failed to verify OTP');
    }
    setIsLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    // Validate password strength
    const validation = validatePassword(newPassword);
    if (!validation.isValid) {
      setError(validation.error || 'Password does not meet requirements');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      const { data } = await invokeSecureFunction('admin-password-reset', {
        action: 'reset_password', username, otp, new_password: newPassword
      });
      if (data?.success) {
        setSuccess('Password reset successful! Please login.');
        setTimeout(() => { setView('login'); setSuccess(''); }, 2000);
      } else {
        setError(data?.error || 'Failed to reset password');
      }
    } catch {
      setError('Failed to reset password');
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="flex justify-center mb-4">
            {settings.authLogo ? (
              <img src={settings.authLogo} alt={settings.companyName} className="h-20 max-w-[280px] object-contain" />
            ) : (
              <Database className="h-16 w-16 text-primary" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {view === 'login' && `${settings.companyName} Dashboard`}
            {view === 'forgot' && 'Reset Password'}
            {view === 'otp' && 'Enter OTP'}
            {view === 'reset' && 'New Password'}
          </CardTitle>
          <CardDescription>
            {view === 'login' && 'Sign in to access the dashboard'}
            {view === 'forgot' && 'Enter your username to receive a reset code'}
            {view === 'otp' && `Enter the code sent to ${emailHint}`}
            {view === 'reset' && 'Enter your new password'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && <Alert variant="destructive" className="mb-4"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
          {success && <Alert className="mb-4 border-green-500"><CheckCircle className="h-4 w-4 text-green-500" /><AlertDescription>{success}</AlertDescription></Alert>}

          {view === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter your username" required disabled={isLoading} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required disabled={isLoading} />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>{isLoading ? 'Signing in...' : 'Sign In'}</Button>
              <Button type="button" variant="link" className="w-full" onClick={() => { setView('forgot'); setError(''); }}>Forgot password?</Button>
            </form>
          )}

          {view === 'forgot' && (
            <form onSubmit={handleRequestOTP} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-username">Username</Label>
                <Input id="reset-username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter your username" required disabled={isLoading} />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>{isLoading ? 'Sending...' : 'Send Reset Code'}</Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setView('login')}><ArrowLeft className="h-4 w-4 mr-2" />Back to login</Button>
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
              <Button className="w-full" onClick={handleVerifyOTP} disabled={otp.length !== 6 || isLoading}>{isLoading ? 'Verifying...' : 'Verify Code'}</Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setView('forgot')}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
            </div>
          )}

          {view === 'reset' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password (min 8 characters)" required disabled={isLoading} />
                <PasswordStrengthMeter password={newPassword} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" required disabled={isLoading} />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>{isLoading ? 'Resetting...' : 'Reset Password'}</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}