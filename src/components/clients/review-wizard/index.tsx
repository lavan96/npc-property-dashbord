import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useReviewWizard } from './useReviewWizard';
import { ReviewWizardSteps } from './ReviewWizardSteps';
import { DataCompletenessStep } from './DataCompletenessStep';
import { MetricsReviewStep } from './MetricsReviewStep';
import { ScorecardStep } from './ScorecardStep';
import { BorrowingCapacityStep } from './BorrowingCapacityStep';
import { FlagsScenariosStep } from './FlagsScenariosStep';
import { RecommendationsStep } from './RecommendationsStep';
import { GenerateReportStep } from './GenerateReportStep';
import type { ReviewWizardProps } from './types';

export function ReviewWizard({
  clientId,
  clientName,
  properties,
  clientData,
  isOpen,
  onClose,
  onComplete
}: ReviewWizardProps) {
  const wizard = useReviewWizard(clientId, clientName, properties, clientData);

  const handleSaveDraft = async () => {
    await wizard.saveReview('draft');
  };

  const handleComplete = async () => {
    const reviewId = await wizard.saveReview('completed');
    if (reviewId) {
      onComplete(reviewId);
      onClose();
    }
  };

  const renderStep = () => {
    switch (wizard.currentStep) {
      case 'data_completeness':
        return <DataCompletenessStep {...wizard.dataCompleteness} />;
      case 'metrics_review':
        return <MetricsReviewStep {...wizard.metrics} />;
      case 'scorecard':
        return <ScorecardStep {...wizard.scorecard} />;
      case 'borrowing_capacity':
        return <BorrowingCapacityStep clientId={clientId} clientName={clientName} />;
      case 'flags_scenarios':
        return <FlagsScenariosStep flags={wizard.flags} scenarios={wizard.scenarios} />;
      case 'recommendations':
        return <RecommendationsStep recommendations={wizard.recommendations} />;
      case 'generate_report':
        return (
          <GenerateReportStep
            clientName={clientName}
            overallScore={wizard.scorecard.overallScore}
            riskLevel={wizard.scorecard.riskLevel}
            totalValue={wizard.metrics.portfolioTotals.totalValue}
            monthlyCashflow={wizard.metrics.portfolioTotals.totalMonthlyCashflow}
            propertyCount={properties.length}
            highPriorityCount={wizard.recommendations.filter(r => r.priority === 'high').length}
            reviewFrequency={wizard.reviewFrequency}
            onReviewFrequencyChange={wizard.setReviewFrequency}
            onSaveDraft={handleSaveDraft}
            onComplete={handleComplete}
            isSaving={wizard.isSaving}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] h-[90vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0 flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle>Portfolio Review: {clientName}</DialogTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-shrink-0">
          <ReviewWizardSteps
            steps={wizard.steps}
            currentStep={wizard.currentStep}
            currentStepIndex={wizard.currentStepIndex}
            onStepClick={wizard.goToStep}
          />
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-4">
            {renderStep()}
          </div>
        </ScrollArea>

        {wizard.currentStep !== 'generate_report' && (
          <div className="flex items-center justify-between px-6 py-4 border-t flex-shrink-0">
            <Button
              variant="outline"
              onClick={wizard.goPrev}
              disabled={!wizard.canGoPrev}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button onClick={wizard.goNext} disabled={!wizard.canGoNext}>
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export * from './types';
