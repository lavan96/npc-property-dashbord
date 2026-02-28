import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PortfolioAnalysisPDFGenerator } from '../PortfolioAnalysisPDFGenerator';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
  Save,
  Home,
  Building2,
  Info,
  Landmark,
  MessageSquareText
} from 'lucide-react';
import { useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PortfolioAnalysisConfig, PortfolioAnalysisSettings } from './PortfolioAnalysisConfig';
import { VoiceNoteRecorder } from '../VoiceNoteRecorder';

interface GenerateReportStepProps {
  clientId: string;
  clientName: string;
  overallScore: number;
  riskLevel: string;
  totalValue: number;
  monthlyCashflow: number;
  propertyCount: number;
  highPriorityCount: number;
  reviewFrequency: 'quarterly' | 'bi_annual' | 'annual';
  onReviewFrequencyChange: (frequency: 'quarterly' | 'bi_annual' | 'annual') => void;
  includeOwnerOccupied: boolean;
  onIncludeOwnerOccupiedChange: (include: boolean) => void;
  includeBorrowingCapacity: boolean;
  onIncludeBorrowingCapacityChange: (include: boolean) => void;
  analysisConfig: PortfolioAnalysisSettings;
  onAnalysisConfigChange: (config: PortfolioAnalysisSettings) => void;
  ownerOccupiedCount: number;
  investmentCount: number;
  onSaveDraft: () => Promise<void>;
  onComplete: () => Promise<void>;
  isSaving: boolean;
}

export function GenerateReportStep({
  clientId,
  clientName,
  overallScore,
  riskLevel,
  totalValue,
  monthlyCashflow,
  propertyCount,
  highPriorityCount,
  reviewFrequency,
  onReviewFrequencyChange,
  includeOwnerOccupied,
  onIncludeOwnerOccupiedChange,
  includeBorrowingCapacity,
  onIncludeBorrowingCapacityChange,
  analysisConfig,
  onAnalysisConfigChange,
  ownerOccupiedCount,
  investmentCount,
  onSaveDraft,
  onComplete,
  isSaving
}: GenerateReportStepProps) {
  const [notes, setNotes] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');

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

      {/* Owner-Occupied Toggle */}
      {ownerOccupiedCount > 0 && (
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Home className="h-5 w-5 text-amber-600" />
              Owner-Occupied Properties
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>When disabled, owner-occupied properties are excluded from portfolio-level calculations (value, debt, equity, LVR, scores) but still shown in property list for reference.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="include-owner-occupied" className="text-sm font-medium">
                  Include in Portfolio Calculations
                </Label>
                <p className="text-xs text-muted-foreground">
                  {ownerOccupiedCount} owner-occupied, {investmentCount} investment properties
                </p>
              </div>
              <Switch
                id="include-owner-occupied"
                checked={includeOwnerOccupied}
                onCheckedChange={onIncludeOwnerOccupiedChange}
              />
            </div>
            
            {!includeOwnerOccupied && (
              <div className="p-3 bg-amber-100/50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-2">
                  <Building2 className="h-4 w-4 text-amber-600 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Portfolio metrics now reflect <strong>investment properties only</strong>. 
                    Owner-occupied properties will still appear in property lists but won't affect 
                    portfolio value, LVR, or score calculations.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Borrowing Capacity Toggle */}
      <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Landmark className="h-5 w-5 text-blue-600" />
            Borrowing Capacity Section
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Control whether the Borrowing Capacity section is included in the final Portfolio Performance Report PDF export.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="include-borrowing-capacity" className="text-sm font-medium">
                Include in Report
              </Label>
              <p className="text-xs text-muted-foreground">
                Show borrowing capacity assessment in PDF export
              </p>
            </div>
            <Switch
              id="include-borrowing-capacity"
              checked={includeBorrowingCapacity}
              onCheckedChange={onIncludeBorrowingCapacityChange}
            />
          </div>
          
          {!includeBorrowingCapacity && (
            <div className="p-3 bg-blue-100/50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-2">
                <Landmark className="h-4 w-4 text-blue-600 mt-0.5" />
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  The Borrowing Capacity section will be <strong>excluded</strong> from the 
                  Portfolio Performance Report PDF. All other sections will remain.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Analysis Configuration */}
      <PortfolioAnalysisConfig
        settings={analysisConfig}
        onChange={onAnalysisConfigChange}
      />

      {/* Custom Instructions for Report */}
      <Card className="border-purple-200 bg-purple-50/50 dark:border-purple-900 dark:bg-purple-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-purple-600" />
            Custom Report Instructions
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Provide specific guidance on how the AI should phrase the report. For example, adjust the tone for the client's risk appetite, highlight specific concerns, or emphasise certain strategies.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Add any specific instructions to tailor the report's language and focus. The report structure stays the same — these instructions influence how findings are phrased and what's emphasised.
          </p>
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <Textarea
                placeholder="e.g. 'Client is very risk-averse — use cautious language and emphasise capital preservation over growth. Highlight the importance of maintaining low LVR across the portfolio.'"
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                rows={4}
                className="text-sm"
              />
            </div>
            <div className="flex-shrink-0 pt-1">
              <VoiceNoteRecorder
                noteType="report-instructions"
                onTranscriptReady={(text) => setCustomInstructions(prev => prev ? `${prev}\n\n${text}` : text)}
              />
            </div>
          </div>
          {customInstructions && (
            <p className="text-xs text-purple-600 dark:text-purple-400">
              ✓ Custom instructions will be applied to the generated report
            </p>
          )}
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

      {/* Generate Portfolio Performance Report */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Generate Performance Report
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Generate a comprehensive Portfolio Performance Analysis PDF using the investor profile settings configured above.
          </p>
          <PortfolioAnalysisPDFGenerator
            clientId={clientId}
            clientName={clientName}
            includeBorrowingCapacity={includeBorrowingCapacity}
            includeOwnerOccupied={includeOwnerOccupied}
            analysisConfig={analysisConfig}
            customInstructions={customInstructions}
          />
        </CardContent>
      </Card>

      <Separator />

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
