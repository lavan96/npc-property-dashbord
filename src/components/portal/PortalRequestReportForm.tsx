import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  BarChart3, PiggyBank, Building2, Send, X, Loader2, CheckCircle2, MapPin
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const SUPABASE_URL = "https://dduzbchuswwbefdunfct.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkdXpiY2h1c3d3YmVmZHVuZmN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0NDM4NzksImV4cCI6MjA3MTAxOTg3OX0.eSYU6fxIc3tBQuGLsdBRff0alBMkNfvv7OpW0efNjxk";
const PORTAL_SESSION_KEY = 'portal_session_token';

function getSessionToken(): string | null {
  try { return sessionStorage.getItem(PORTAL_SESSION_KEY) || localStorage.getItem(PORTAL_SESSION_KEY); }
  catch { try { return localStorage.getItem(PORTAL_SESSION_KEY); } catch { return null; } }
}

interface Property {
  id: string;
  address?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  property_type?: string;
}

interface Props {
  properties: Property[];
  onSubmitted: () => void;
  onCancel: () => void;
}

const reportTypes = [
  {
    value: 'portfolio_review',
    label: 'Portfolio Performance Review',
    description: 'A comprehensive analysis of your entire investment portfolio performance, equity growth, and projections.',
    icon: BarChart3,
    color: 'border-emerald-200 bg-emerald-500/5 hover:bg-emerald-500/10',
    activeColor: 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/20',
    iconColor: 'text-emerald-600',
  },
  {
    value: 'borrowing_capacity',
    label: 'Borrowing Capacity Snapshot',
    description: 'An updated assessment of your current borrowing power based on income, expenses, and existing commitments.',
    icon: PiggyBank,
    color: 'border-amber-200 bg-amber-500/5 hover:bg-amber-500/10',
    activeColor: 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/20',
    iconColor: 'text-amber-600',
  },
  {
    value: 'investment_property',
    label: 'Investment Property Report',
    description: 'Detailed investment analysis for a specific property — from your portfolio or a new property you\'re considering.',
    icon: Building2,
    color: 'border-blue-200 bg-blue-500/5 hover:bg-blue-500/10',
    activeColor: 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/20',
    iconColor: 'text-blue-600',
  },
];

export function PortalRequestReportForm({ properties, onSubmitted, onCancel }: Props) {
  const [requestType, setRequestType] = useState<string>('');
  const [propertySource, setPropertySource] = useState<'portfolio' | 'external'>('portfolio');
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
  const [externalAddress, setExternalAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const formatPropertyAddress = (p: Property) => {
    return [p.address, p.suburb, p.state, p.postcode].filter(Boolean).join(', ');
  };

  const handleSubmit = async () => {
    if (!requestType) {
      toast.error('Please select a report type');
      return;
    }

    if (requestType === 'investment_property') {
      if (propertySource === 'portfolio' && !selectedPropertyId) {
        toast.error('Please select a property from your portfolio');
        return;
      }
      if (propertySource === 'external' && !externalAddress.trim()) {
        toast.error('Please enter the property address');
        return;
      }
    }

    setSubmitting(true);
    try {
      const sessionToken = getSessionToken();
      const payload: Record<string, any> = {
        operation: 'insert',
        table: 'client_portal_report_requests',
        data: {
          request_type: requestType,
          notes: notes.trim() || null,
        },
        portal_session_token: sessionToken,
      };

      if (requestType === 'investment_property') {
        if (propertySource === 'portfolio' && selectedPropertyId) {
          payload.data.client_property_id = selectedPropertyId;
          const prop = properties.find(p => p.id === selectedPropertyId);
          if (prop) payload.data.property_address = formatPropertyAddress(prop);
        } else if (propertySource === 'external') {
          payload.data.property_address = externalAddress.trim();
        }
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-portal-client-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          ...(sessionToken ? { 'x-portal-session-token': sessionToken } : {}),
        },
        credentials: 'omit',
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to submit request');
      }

      setSubmitted(true);
      toast.success('Report request submitted successfully!');
      setTimeout(() => onSubmitted(), 1500);
    } catch (err: any) {
      toast.error('Failed to submit: ' + (err.message || 'Unknown error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Card className="border-emerald-200 bg-emerald-500/5">
        <CardContent className="py-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground">Request Submitted!</p>
          <p className="text-xs text-muted-foreground mt-1">Your advisor will review this and prepare the report for you.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            Request a Report
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onCancel} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Report Type Selection */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">What type of report do you need?</Label>
          <div className="grid gap-3">
            {reportTypes.map((type) => {
              const Icon = type.icon;
              const isSelected = requestType === type.value;
              return (
                <button
                  key={type.value}
                  onClick={() => setRequestType(type.value)}
                  className={cn(
                    'flex items-start gap-3 p-4 rounded-xl border text-left transition-all duration-200',
                    isSelected ? type.activeColor : type.color
                  )}
                >
                  <div className={cn('p-2 rounded-lg shrink-0', isSelected ? 'bg-background' : 'bg-background/80')}>
                    <Icon className={cn('h-5 w-5', type.iconColor)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{type.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{type.description}</p>
                  </div>
                  {isSelected && (
                    <CheckCircle2 className={cn('h-5 w-5 shrink-0 mt-0.5', type.iconColor)} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Property Selection (for investment_property type) */}
        {requestType === 'investment_property' && (
          <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
            <Label className="text-sm font-medium">Which property?</Label>
            <div className="flex gap-2">
              <Button
                variant={propertySource === 'portfolio' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setPropertySource('portfolio'); setExternalAddress(''); }}
                className="text-xs"
              >
                <Building2 className="h-3.5 w-3.5 mr-1.5" />
                From Portfolio
              </Button>
              <Button
                variant={propertySource === 'external' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setPropertySource('external'); setSelectedPropertyId(''); }}
                className="text-xs"
              >
                <MapPin className="h-3.5 w-3.5 mr-1.5" />
                New / External Property
              </Button>
            </div>

            {propertySource === 'portfolio' ? (
              properties.length > 0 ? (
                <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a property..." />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {formatPropertyAddress(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
                  No properties in your portfolio. Use "New / External Property" to enter an address.
                </p>
              )
            ) : (
              <div className="space-y-1">
                <Input
                  placeholder="Enter full property address..."
                  value={externalAddress}
                  onChange={(e) => setExternalAddress(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground">Include street, suburb, state and postcode</p>
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Additional Notes (optional)</Label>
          <Textarea
            placeholder="Any specific details or areas of focus you'd like included..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !requestType}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-1.5" />
                Submit Request
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
