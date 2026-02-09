import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Mail, 
  Search, 
  ExternalLink, 
  Loader2, 
  Inbox,
  Clock,
  AlertCircle,
  Sparkles,
  MessageSquare,
  Reply,
  X
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface LinkedEmail {
  id: string;
  sender: string;
  subject: string;
  body: string;
  received_at: string;
  status: string;
  urgency_level: string | null;
  summary: any | null;
  draft_reply: string | null;
  folder: 'inbox' | 'sent';
}

interface ClientEmailsTabProps {
  clientId: string;
  clientName: string;
}

export function ClientEmailsTab({ clientId, clientName }: ClientEmailsTabProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch emails linked to this client
  const { data: emails = [], isLoading, refetch } = useQuery({
    queryKey: ['client-emails', clientId],
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction('get-client-data', {
        clientId,
        include: { emails: true },
      });

      if (error) throw error;
      return (data?.emails || []) as LinkedEmail[];
    },
  });

  // Handle unlinking an email
  const handleUnlink = async (emailId: string) => {
    try {
      const { error } = await invokeSecureFunction('email-copilot', {
        action: 'assign_client',
        emailId,
        clientId: null,
      });

      if (error) throw error;
      toast.success('Email unlinked from client');
      refetch();
    } catch (err) {
      toast.error('Failed to unlink email');
    }
  };

  const handleViewInCopilot = (emailId: string) => {
    // Navigate to Email Copilot with the email selected
    navigate(`/email-copilot?emailId=${emailId}`);
  };

  const filteredEmails = emails.filter(email => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      email.subject?.toLowerCase().includes(query) ||
      email.sender?.toLowerCase().includes(query) ||
      email.body?.toLowerCase().includes(query)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'unread':
        return <Badge variant="default" className="text-[10px]">Unread</Badge>;
      case 'summarized':
        return (
          <Badge variant="outline" className="text-[10px] text-green-600 border-green-500/30">
            <Sparkles className="h-2.5 w-2.5 mr-0.5" /> Summarized
          </Badge>
        );
      case 'drafted':
        return (
          <Badge variant="outline" className="text-[10px] text-purple-600 border-purple-500/30">
            <MessageSquare className="h-2.5 w-2.5 mr-0.5" /> Drafted
          </Badge>
        );
      case 'replied':
        return (
          <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-500/30">
            <Reply className="h-2.5 w-2.5 mr-0.5" /> Replied
          </Badge>
        );
      default:
        return <Badge variant="secondary" className="text-[10px]">{status}</Badge>;
    }
  };

  const getUrgencyBadge = (level: string | null) => {
    if (!level || level === 'low') return null;
    return (
      <Badge 
        variant="outline" 
        className={`text-[10px] ${
          level === 'high' ? 'text-destructive border-destructive/30' : 'text-warning border-warning/30'
        }`}
      >
        {level === 'high' ? '🔴' : '🟡'} {level}
      </Badge>
    );
  };

  const extractSenderName = (sender: string): string => {
    const match = sender.match(/^([^<]+)</);
    if (match) return match[1].trim();
    const emailMatch = sender.match(/^([^@]+)@/);
    if (emailMatch) {
      return emailMatch[1]
        .split(/[._-]/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
    }
    return sender;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <Inbox className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">No Linked Emails</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            No emails have been linked to {clientName} yet. 
            You can assign emails from the Email Copilot.
          </p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => navigate('/email-copilot')}
          >
            <Mail className="h-4 w-4 mr-2" />
            Go to Email Copilot
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sticky Search */}
      <div className="sticky top-0 z-10 bg-background pb-3 flex-shrink-0">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search emails..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Emails Table - scrollable body with sticky header */}
      <Card className="flex-1 min-h-0 overflow-hidden">
        <div className="overflow-auto max-h-[calc(60vh-120px)]">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>From</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEmails.map((email) => (
                <TableRow key={email.id} className="group">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-primary">
                          {extractSenderName(email.sender).slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <span className="truncate max-w-[150px]">
                        {extractSenderName(email.sender)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-[300px]">
                      <p className="truncate font-medium">{email.subject || '(No Subject)'}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {email.body?.slice(0, 60).replace(/\n/g, ' ')}...
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <p>{format(new Date(email.received_at), 'MMM d, yyyy')}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(email.received_at), { addSuffix: true })}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 flex-wrap">
                      {getStatusBadge(email.status)}
                      {getUrgencyBadge(email.urgency_level)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleViewInCopilot(email.id)}
                        title="View in Email Copilot"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleUnlink(email.id)}
                        title="Unlink from client"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Summary */}
      <p className="text-xs text-muted-foreground text-center pt-2 flex-shrink-0">
        {filteredEmails.length} email{filteredEmails.length !== 1 ? 's' : ''} linked to this client
      </p>
    </div>
  );
}
