import { CheckCircle2, Circle, CircleDot } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReviewStep } from './types';

interface ReviewWizardStepsProps {
  steps: ReviewStep[];
  currentStep: ReviewStep;
  currentStepIndex: number;
  onStepClick: (step: ReviewStep) => void;
}

const stepLabels: Record<ReviewStep, string> = {
  data_completeness: 'Data Quality',
  metrics_review: 'Metrics',
  scorecard: 'Scorecard',
  borrowing_capacity: 'Borrowing Power',
  flags_scenarios: 'Flags & Scenarios',
  recommendations: 'Recommendations',
  generate_report: 'Complete'
};

export function ReviewWizardSteps({ 
  steps, 
  currentStep, 
  currentStepIndex,
  onStepClick 
}: ReviewWizardStepsProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 overflow-x-auto scrollbar-hide gap-1">
      {steps.map((step, index) => {
        const isCompleted = index < currentStepIndex;
        const isCurrent = step === currentStep;
        const isClickable = index <= currentStepIndex;

        return (
          <button
            key={step}
            onClick={() => isClickable && onStepClick(step)}
            disabled={!isClickable}
            className={cn(
              "flex items-center gap-1.5 sm:gap-2 text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0",
              isClickable && "cursor-pointer hover:text-primary",
              !isClickable && "cursor-not-allowed opacity-50",
              isCurrent && "text-primary",
              isCompleted && "text-green-600"
            )}
          >
            {isCompleted ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : isCurrent ? (
              <CircleDot className="h-4 w-4" />
            ) : (
              <Circle className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">{stepLabels[step]}</span>
            <span className="sm:hidden">{index + 1}</span>
          </button>
        );
      })}
    </div>
  );
}
