import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { User, Key, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export function ProfileCredentials() {
  const { user } = useAuth();
  const { toast } = useToast();
  const sessionToken = localStorage.getItem('session_token');

  const [profile, setProfile] = useState<{
    username: string;
    email: string | null;
    role: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // Username update
  const [newUsername, setNewUsername] = useState('');
  const [updatingUsername, setUpdatingUsername] = useState(false);

  // Password update
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    if (!sessionToken) {
      setLoading(false);
      return;
    }

    try {
      const { data } = await supabase.functions.invoke('admin-user-management', {
        body: { action: 'get_own_profile', session_token: sessionToken }
      });

      if (data?.success && data.user) {
        setProfile({
          username: data.user.username,
          email: data.user.email,
          role: data.user.role
        });
        setNewUsername(data.user.username);
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUsername = async () => {
    if (!sessionToken || !newUsername.trim()) return;

    if (newUsername.trim().length < 3) {
      toast({
        title: "Invalid Username",
        description: "Username must be at least 3 characters.",
        variant: "destructive"
      });
      return;
    }

    setUpdatingUsername(true);
    try {
      const { data } = await supabase.functions.invoke('admin-user-management', {
        body: {
          action: 'update_own_credentials',
          session_token: sessionToken,
          new_username: newUsername.trim()
        }
      });

      if (data?.success) {
        setProfile(prev => prev ? { ...prev, username: newUsername.trim() } : prev);
        toast({
          title: "Username Updated",
          description: "Your username has been changed successfully.",
        });
      } else {
        toast({
          title: "Error",
          description: data?.error || "Failed to update username.",
          variant: "destructive"
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to update username. Please try again.",
        variant: "destructive"
      });
    } finally {
      setUpdatingUsername(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!sessionToken) return;

    setPasswordError('');

    if (!currentPassword) {
      setPasswordError('Current password is required');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setUpdatingPassword(true);
    try {
      const { data } = await supabase.functions.invoke('admin-user-management', {
        body: {
          action: 'update_own_credentials',
          session_token: sessionToken,
          current_password: currentPassword,
          new_password: newPassword
        }
      });

      if (data?.success) {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        toast({
          title: "Password Updated",
          description: "Your password has been changed successfully.",
        });
      } else {
        setPasswordError(data?.error || 'Failed to update password');
      }
    } catch (err) {
      setPasswordError('Failed to update password. Please try again.');
    } finally {
      setUpdatingPassword(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile & Credentials
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Profile & Credentials
        </CardTitle>
        <CardDescription>
          Update your username and password
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Info */}
        <div className="rounded-lg bg-muted/50 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Current Username</span>
            <span className="font-medium">{profile.username}</span>
          </div>
          {profile.email && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Email</span>
              <span className="font-medium">{profile.email}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Role</span>
            <span className="font-medium">
              {profile.role === 'super_admin' 
                ? 'Super Administrator' 
                : profile.role === 'sub_admin' 
                  ? 'Administrator' 
                  : profile.role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </span>
          </div>
        </div>

        <Separator />

        {/* Update Username */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <User className="h-4 w-4" />
            Change Username
          </h4>
          <div className="space-y-2">
            <Label htmlFor="new-username">New Username</Label>
            <Input
              id="new-username"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="Enter new username"
              disabled={updatingUsername}
            />
          </div>
          <Button
            onClick={handleUpdateUsername}
            disabled={updatingUsername || newUsername === profile.username || !newUsername.trim()}
            className="w-full"
          >
            {updatingUsername && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
            Update Username
          </Button>
        </div>

        <Separator />

        {/* Update Password */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Key className="h-4 w-4" />
            Change Password
          </h4>

          {passwordError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{passwordError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="current-password">Current Password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              disabled={updatingPassword}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password (min 6 characters)"
              disabled={updatingPassword}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              disabled={updatingPassword}
            />
          </div>

          <Button
            onClick={handleUpdatePassword}
            disabled={updatingPassword || !currentPassword || !newPassword || !confirmPassword}
            className="w-full"
          >
            {updatingPassword && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
            Update Password
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}