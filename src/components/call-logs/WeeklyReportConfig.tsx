import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Send, Loader2, CheckCircle, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const WeeklyReportConfig: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [reportPeriod, setReportPeriod] = useState('7');
  const [isSending, setIsSending] = useState(false);
  const [lastSent, setLastSent] = useState<string | null>(null);

  useEffect(() => {
    const savedEmail = localStorage.getItem('weeklyReportEmail');
    const savedLastSent = localStorage.getItem('weeklyReportLastSent');
    if (savedEmail) setRecipientEmail(savedEmail);
    if (savedLastSent) setLastSent(savedLastSent);
  }, []);

  const handleSendReport = async () => {
    if (!recipientEmail) {
      toast.error('Please enter a recipient email');
      return;
    }

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-weekly-call-report', {
        body: {
          recipientEmail,
          daysBack: parseInt(reportPeriod),
        },
      });

      if (error) throw error;

      localStorage.setItem('weeklyReportEmail', recipientEmail);
      const now = new Date().toISOString();
      localStorage.setItem('weeklyReportLastSent', now);
      setLastSent(now);

      toast.success(`Report sent to ${recipientEmail}`);
      setIsOpen(false);
    } catch (error: any) {
      console.error('Error sending report:', error);
      toast.error(error.message || 'Failed to send report');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FileText className="h-4 w-4" />
          Weekly Report
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Weekly Performance Report
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Report Contents</CardTitle>
              <CardDescription className="text-xs">
                Summary of call performance metrics
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <ul className="space-y-1 list-disc list-inside">
                <li>Total call volume & average duration</li>
                <li>Quality scores & grades</li>
                <li>Sentiment analysis breakdown</li>
                <li>Call outcomes summary</li>
                <li>Top call intents</li>
                <li>Alerts triggered count</li>
              </ul>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Label htmlFor="recipientEmail">Recipient Email</Label>
            <Input
              id="recipientEmail"
              type="email"
              placeholder="admin@example.com"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reportPeriod">Report Period</Label>
            <Select value={reportPeriod} onValueChange={setReportPeriod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {lastSent && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded">
              <CheckCircle className="h-3 w-3 text-green-500" />
              Last sent: {new Date(lastSent).toLocaleString()}
            </div>
          )}

          <Button
            onClick={handleSendReport}
            disabled={isSending || !recipientEmail}
            className="w-full gap-2"
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating & Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send Report Now
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            <Calendar className="h-3 w-3 inline mr-1" />
            For automated weekly reports, contact your administrator
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
