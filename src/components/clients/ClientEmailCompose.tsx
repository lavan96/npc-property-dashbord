import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Mail, 
  Loader2, 
  Paperclip, 
  X, 
  ChevronDown, 
  ChevronUp,
  Send
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface ClientEmailComposeProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  clientEmail: string | null;
  attachments?: Array<{
    id: string;
    file_name: string;
    file_path: string;
    file_size?: number | null;
    is_vownet_form?: boolean;
  }>;
  preSelectedAttachmentId?: string;
  defaultSubject?: string;
  defaultBody?: string;
}

export function ClientEmailCompose({
  open,
  onOpenChange,
  clientId,
  clientName,
  clientEmail,
  attachments = [],
  preSelectedAttachmentId,
  defaultSubject,
  defaultBody
}: ClientEmailComposeProps) {
  const [to, setTo] = useState(clientEmail || '');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [selectedMailbox, setSelectedMailbox] = useState<string>('');
  const [selectedAttachments, setSelectedAttachments] = useState<string[]>([]);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const { user } = useAuth();

  // Fetch available mailboxes
  const { data: mailboxes = [] } = useQuery({
    queryKey: ['mailboxes-for-email'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_users')
        .select('id, email, personal_mailbox')
        .not('personal_mailbox', 'is', null);
      
      if (error) throw error;
      return data.filter(u => u.personal_mailbox) || [];
    },
    enabled: open
  });

  // Set defaults when modal opens
  useEffect(() => {
    if (open) {
      setTo(clientEmail || '');
      // Use provided defaults or fallback to generic template
      setSubject(defaultSubject || `Portfolio Update - ${clientName}`);
      setBody(defaultBody || `Dear ${clientName.split(' ')[0]},\n\nPlease find attached your updated portfolio documentation.\n\nKind regards`);
      
      // Pre-select attachment if specified
      if (preSelectedAttachmentId) {
        setSelectedAttachments([preSelectedAttachmentId]);
      }
      
      // Set default mailbox
      if (mailboxes.length > 0 && !selectedMailbox) {
        const userMailbox = mailboxes.find(m => m.id === user?.id);
        setSelectedMailbox(userMailbox?.personal_mailbox || mailboxes[0]?.personal_mailbox || '');
      }
    }
  }, [open, clientEmail, clientName, preSelectedAttachmentId, mailboxes, user?.id, defaultSubject, defaultBody]);

  const toggleAttachment = (attachmentId: string) => {
    setSelectedAttachments(prev => 
      prev.includes(attachmentId) 
        ? prev.filter(id => id !== attachmentId)
        : [...prev, attachmentId]
    );
  };

  const handleSend = async () => {
    if (!to.trim()) {
      toast.error('Please enter a recipient email');
      return;
    }
    if (!selectedMailbox) {
      toast.error('Please select a sender mailbox');
      return;
    }
    if (!subject.trim()) {
      toast.error('Please enter a subject');
      return;
    }

    setIsSending(true);

    try {
      // Get signed URLs for selected attachments
      const attachmentData = await Promise.all(
        selectedAttachments.map(async (attachmentId) => {
          const attachment = attachments.find(a => a.id === attachmentId);
          if (!attachment) return null;

          const { data } = await supabase.storage
            .from('client-documents')
            .createSignedUrl(attachment.file_path, 3600); // 1 hour expiry

          return {
            name: attachment.file_name,
            url: data?.signedUrl,
            path: attachment.file_path
          };
        })
      );

      const validAttachments = attachmentData.filter(Boolean);

      // Parse CC and BCC emails
      const ccEmails = cc.split(',').map(e => e.trim()).filter(Boolean);
      const bccEmails = bcc.split(',').map(e => e.trim()).filter(Boolean);

      const { data, error } = await supabase.functions.invoke('send-email-reply', {
        body: {
          to: to.trim(),
          cc: ccEmails,
          bcc: bccEmails,
          subject: subject.trim(),
          body: body,
          senderMailbox: selectedMailbox,
          attachments: validAttachments,
          clientId,
        }
      });

      if (error) throw error;

      toast.success('Email sent successfully');
      onOpenChange(false);
      
      // Reset form
      setTo('');
      setCc('');
      setBcc('');
      setSubject('');
      setBody('');
      setSelectedAttachments([]);
      setShowCcBcc(false);

    } catch (error: any) {
      console.error('Send email error:', error);
      toast.error('Failed to send email: ' + error.message);
    } finally {
      setIsSending(false);
    }
  };

  const formatFileSize = (bytes: number | null | undefined) => {
    if (!bytes) return '';
    const kb = bytes / 1024;
    return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Compose Email
          </DialogTitle>
          <DialogDescription>
            Send an email to {clientName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Sender */}
          <div className="space-y-2">
            <Label>From</Label>
            <Select value={selectedMailbox} onValueChange={setSelectedMailbox}>
              <SelectTrigger>
                <SelectValue placeholder="Select sender mailbox" />
              </SelectTrigger>
              <SelectContent>
                {mailboxes.map((mailbox) => (
                  <SelectItem key={mailbox.id} value={mailbox.personal_mailbox || ''}>
                    {mailbox.personal_mailbox}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Recipient */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>To</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCcBcc(!showCcBcc)}
                className="h-auto py-0 px-1 text-xs text-muted-foreground"
              >
                {showCcBcc ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                Cc/Bcc
              </Button>
            </div>
            <Input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@email.com"
            />
          </div>

          {/* CC/BCC fields */}
          {showCcBcc && (
            <>
              <div className="space-y-2">
                <Label>Cc</Label>
                <Input
                  type="text"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="cc@email.com, another@email.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Bcc</Label>
                <Input
                  type="text"
                  value={bcc}
                  onChange={(e) => setBcc(e.target.value)}
                  placeholder="bcc@email.com"
                />
              </div>
            </>
          )}

          {/* Subject */}
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
            />
          </div>

          {/* Body */}
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message..."
              rows={6}
            />
          </div>

          {/* Attachments */}
          {attachments.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4" />
                  Attachments
                </Label>
                <div className="flex flex-wrap gap-2">
                  {attachments.map((attachment) => (
                    <Badge
                      key={attachment.id}
                      variant={selectedAttachments.includes(attachment.id) ? 'default' : 'outline'}
                      className="cursor-pointer transition-colors"
                      onClick={() => toggleAttachment(attachment.id)}
                    >
                      {attachment.is_vownet_form && (
                        <span className="text-xs mr-1">📊</span>
                      )}
                      {attachment.file_name}
                      {attachment.file_size && (
                        <span className="text-xs opacity-70 ml-1">
                          ({formatFileSize(attachment.file_size)})
                        </span>
                      )}
                      {selectedAttachments.includes(attachment.id) && (
                        <X className="h-3 w-3 ml-1" />
                      )}
                    </Badge>
                  ))}
                </div>
                {selectedAttachments.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {selectedAttachments.length} file(s) will be attached
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={isSending}>
            {isSending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Send Email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}