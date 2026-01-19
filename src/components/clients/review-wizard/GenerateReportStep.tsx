import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  FileText,
  Calendar,
  CheckCircle2,
  Loader2,
  Save
} from 'lucide-react';
import { useState } from 'react';

interface GenerateReportStepProps {
  clientName: string;
  overallScore: number;
  riskLevel: string;
  totalValue: number;
  monthlyCashflow: number;
  propertyCount: number;
  highPriorityCount: number;
  reviewFrequency: 'quarterly' | 'bi_annual' | 'annual';
  onReviewFrequencyChange: (frequency: 'quarterly' | 'bi_annual' | 'annual') => void;
  onSaveDraft: () => Promise<void>;
  onComplete: () => Promise<void>;
  isSaving: boolean;
}

export function GenerateReportStep({
  clientName,
  overallScore,
  riskLevel,
  totalValue,
  monthlyCashflow,
  propertyCount,
  highPriorityCount,
  reviewFrequency,
  onReviewFrequencyChange,
  onSaveDraft,
  onComplete,
  isSaving
}: GenerateReportStepProps) {
  const [notes, setNotes] = useState('');

  const getNextReviewDate = () => {
    const days = reviewFrequency === 'quarterly' ? 90 : reviewFrequency === 'bi_annual' ? 180 : 365;
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    }
    return `$${value.toLocaleString()}`;
  };

  return (
    <div className="space-y-6">
      {/* Review Summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Review Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-3xl font-bold text-primary">{overallScore}</div>
              <p className="text-xs text-muted-foreground">Overall Score</p>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <Badge className={
                riskLevel === 'low' ? 'bg-green-500/10 text-green-600' :
                riskLevel === 'medium' ? 'bg-yellow-500/10 text-yellow-600' :
                riskLevel === 'high' ? 'bg-orange-500/10 text-orange-600' :
                'bg-red-500/10 text-red-600'
              }>
                {riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)} Risk
              </Badge>
              <p className="text-xs text-muted-foreground mt-2">Risk Level</p>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-xl font-bold">{formatCurrency(totalValue)}</div>
              <p className="text-xs text-muted-foreground">Portfolio Value</p>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className={`text-xl font-bold ${monthlyCashflow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${monthlyCashflow.toLocaleString()}/mo
              </div>
              <p className="text-xs text-muted-foreground">Net Cash Flow</p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm">
              <span className="text-muted-foreground">Properties reviewed: </span>
              <span className="font-medium">{propertyCount}</span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Action items: </span>
              <span className={`font-medium ${highPriorityCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {highPriorityCount} high priority
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Review Frequency */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Review Schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Review Frequency</Label>
            <Select value={reviewFrequency} onValueChange={onReviewFrequencyChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="quarterly">Quarterly (every 3 months)</SelectItem>
                <SelectItem value="bi_annual">Bi-Annual (every 6 months)</SelectItem>
                <SelectItem value="annual">Annual (every 12 months)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm">
              <span className="text-muted-foreground">Next review due: </span>
              <span className="font-medium">{getNextReviewDate()}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Additional Notes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Additional Notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Add any additional notes or observations from this review..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
          />
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onSaveDraft}
          disabled={isSaving}
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save as Draft
        </Button>
        <Button
          className="flex-1"
          onClick={onComplete}
          disabled={isSaving}
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4 mr-2" />
          )}
          Complete Review
        </Button>
      </div>
    </div>
  );
}
