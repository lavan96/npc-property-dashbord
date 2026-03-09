import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { toast } from 'sonner';
import { Loader2, Mail, CheckCircle, Copy, AlertCircle, ShieldOff, RefreshCw } from 'lucide-react';

interface SendPortalInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  clientEmail: string | null;
}

interface PortalStatus {
  has_portal_access: boolean;
  is_invited: boolean;
  portal_user: {
    id: string;
    email: string;
    status: string;
    created_at: string;
    last_login_at: string | null;
    invite_expires_at: string | null;
  } | null;
}

export function SendPortalInviteDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  clientEmail,
}: SendPortalInviteDialogProps) {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [status, setStatus] = useState<PortalStatus | null>(null);
  const [email, setEmail] = useState(clientEmail || '');
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEmail(clientEmail || '');
      setInviteLink(null);
      checkStatus();
    }
  }, [open, clientId]);

  const checkStatus = async () => {
    setLoading(true);
    const { data, error } = await invokeSecureFunction('client-portal-invite', {
      action: 'check_status',
      client_id: clientId,
    });
    if (!error && data) {
      setStatus(data as PortalStatus);
    }
    setLoading(false);
  };

  const handleSendInvite = async (resend = false) => {
    if (!email) {
      toast.error('Email address is required');
      return;
    }
    setSending(true);
    const { data, error } = await invokeSecureFunction('client-portal-invite', {
      client_id: clientId,
      email,
      resend_invite: resend,
    });

    if (error) {
      toast.error(error.message || 'Failed to send invite');
    } else if (data?.success) {
      if (data.email_sent) {
        toast.success(`Invite sent to ${email}`);
      } else {
        toast.warning(data.message || 'Invite created but email not sent');
      }
      if (data.invite_link) {
        setInviteLink(data.invite_link);
      }
      checkStatus();
    } else {
      toast.error(data?.error || 'Failed to send invite');
    }
    setSending(false);
  };

  const handleRevoke = async () => {
    setRevoking(true);
    const { data, error } = await invokeSecureFunction('client-portal-invite', {
      action: 'revoke',
      client_id: clientId,
    });
    if (error) {
      toast.error('Failed to revoke access');
    } else {
      toast.success('Portal access revoked');
      checkStatus();
      setInviteLink(null);
    }
    setRevoking(false);
  };

  const copyLink = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      toast.success('Invite link copied to clipboard');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Client Portal Access</DialogTitle>
          <DialogDescription>
            Manage portal access for {clientName}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Current Status */}
            {status?.portal_user && (
              <div className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Portal Status</span>
                  <Badge
                    variant={status.has_portal_access ? 'default' : status.is_invited ? 'secondary' : 'outline'}
                  >
                    {status.portal_user.status === 'active' && 'Active'}
                    {status.portal_user.status === 'invited' && 'Pending Invite'}
                    {status.portal_user.status === 'disabled' && 'Disabled'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{status.portal_user.email}</p>
                {status.portal_user.last_login_at && (
                  <p className="text-xs text-muted-foreground">
                    Last login: {new Date(status.portal_user.last_login_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}

            {/* Send / Resend Invite */}
            {(!status?.has_portal_access || status?.portal_user?.status === 'disabled') && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email Address</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="client@example.com"
                    disabled={sending}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => handleSendInvite(!!status?.portal_user)}
                  disabled={sending || !email}
                >
                  {sending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</>
                  ) : (
                    <><Mail className="h-4 w-4 mr-2" />{status?.portal_user ? 'Resend Invite' : 'Send Portal Invite'}</>
                  )}
                </Button>
              </div>
            )}

            {/* Pending invite - offer resend */}
            {status?.is_invited && (
              <div className="space-y-3">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    An invite was sent but hasn't been accepted yet.
                    {status.portal_user?.invite_expires_at && (
                      <> Expires: {new Date(status.portal_user.invite_expires_at).toLocaleDateString()}</>
                    )}
                  </AlertDescription>
                </Alert>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleSendInvite(true)}
                  disabled={sending}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Resend Invite
                </Button>
              </div>
            )}

            {/* Invite link for manual copy */}
            {inviteLink && (
              <div className="space-y-2">
                <Label>Invite Link</Label>
                <div className="flex gap-2">
                  <Input value={inviteLink} readOnly className="text-xs font-mono" />
                  <Button variant="outline" size="icon" onClick={copyLink}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">This link expires in 48 hours.</p>
              </div>
            )}

            {/* Revoke access for active users */}
            {status?.has_portal_access && (
              <div className="pt-2 border-t border-border">
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={handleRevoke}
                  disabled={revoking}
                >
                  {revoking ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Revoking...</>
                  ) : (
                    <><ShieldOff className="h-4 w-4 mr-2" />Revoke Portal Access</>
                  )}
                </Button>
              </div>
            )}

            {/* No email warning */}
            {!clientEmail && !email && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>This client has no email on file. Enter one above to send an invite.</AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
