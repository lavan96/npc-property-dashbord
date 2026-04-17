import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Building2, CheckCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { validatePassword } from '@/utils/passwordValidation';
import { PasswordStrengthMeter } from '@/components/ui/password-strength-meter';

const SUPABASE_URL = "https://dduzbchuswwbefdunfct.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkdXpiY2h1c3d3YmVmZHVuZmN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0NDM4NzksImV4cCI6MjA3MTAxOTg3OX0.eSYU6fxIc3tBQuGLsdBRff0alBMkNfvv7OpW0efNjxk";

async function invokeFunction(functionName: string, body: Record<string, any>) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    credentials: 'omit',
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) return { data, error: { message: data.error || `HTTP ${response.status}` } };
  return { data, error: null };
}

export default function FinancePortalAcceptInvite() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [validating, setValidating] = useState(true);
  const [inviteValid, setInviteValid] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [alreadyActive, setAlreadyActive] = useState(false);
  const [expiredInvite, setExpiredInvite] = useState(false);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) { setValidating(false); return; }
    (async () => {
      const { data, error } = await invokeFunction('finance-portal-accept-invite', {
        action: 'validate', token,
      });
      if (error || !data?.valid) {
        setInviteValid(false);
        if (data?.expired) setExpiredInvite(true);
      } else {
        setInviteValid(true);
        setInviteEmail(data.email || '');
        setInviteName(data.name || '');
        if (data.already_active) setAlreadyActive(true);
      }
      setValidating(false);
    })();
  }, [token]);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    const v = validatePassword(password);
    if (!v.isValid) {
      setError(v.error || 'Password does not meet requirements');
      return;
    }
    setIsSubmitting(true);
    const { data, error: invokeErr } = await invokeFunction('finance-portal-accept-invite', {
      action: 'accept', token, password,
    });
    if (invokeErr || !data?.success) {
      setError(data?.error || invokeErr?.message || 'Failed to set password');
      setIsSubmitting(false);
      return;
    }
    setSuccess(true);
    setTimeout(() => navigate('/finance/login', { replace: true }), 2000);
  };

  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground text-sm">Validating invitation...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Finance Portal</CardTitle>
          <CardDescription>
            {success ? 'Welcome aboard!' :
              alreadyActive ? 'Account already active' :
                expiredInvite ? 'Invitation expired' :
                  !inviteValid ? 'Invalid invitation' :
                    `Set up your account, ${inviteName || inviteEmail}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {success && (
            <Alert className="border-green-500/40 bg-green-500/5">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <AlertDescription>Password set successfully. Redirecting to sign in...</AlertDescription>
            </Alert>
          )}

          {!success && !inviteValid && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {expiredInvite
                  ? 'This invitation has expired. Please contact your administrator for a new invite.'
                  : 'This invitation link is invalid or has been revoked.'}
              </AlertDescription>
            </Alert>
          )}

          {!success && inviteValid && alreadyActive && (
            <Alert>
              <AlertDescription>
                Your account is already active.{' '}
                <Link to="/finance/login" className="text-primary hover:underline">Sign in here</Link>.
              </AlertDescription>
            </Alert>
          )}

          {!success && inviteValid && !alreadyActive && (
            <form onSubmit={handleSetPassword} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={inviteEmail} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <div className="relative">
                  <Input
                    id="password" type={showPassword ? 'text' : 'password'}
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    required disabled={isSubmitting} className="pr-10"
                  />
                  <Button
                    type="button" variant="ghost" size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)} tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                </div>
                <PasswordStrengthMeter password={password} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirm" type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    required disabled={isSubmitting} className="pr-10"
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
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Setting password...' : 'Set Password & Activate'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
