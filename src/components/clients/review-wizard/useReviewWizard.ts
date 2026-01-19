import { useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';
import type { 
  ReviewStep,
  ReviewWizardData,
  PropertyDataQuality,
  PropertyMetrics,
  PropertyScore,
  ValidationFlag,
  Scenario
} from './types';

const REQUIRED_PROPERTY_FIELDS = [
  'value', 'loan_remaining', 'interest_rate', 'monthly_rental_income',
  'monthly_council_rates', 'monthly_water_rates', 'monthly_property_management'
];

const OPTIONAL_PROPERTY_FIELDS = [
  'monthly_body_corporate', 'monthly_repairs_maintenance', 
  'monthly_landlord_insurance', 'monthly_building_insurance'
];

export function useReviewWizard(
  clientId: string,
  clientName: string,
  properties: any[],
  clientData: any
) {
  const [currentStep, setCurrentStep] = useState<ReviewStep>('data_completeness');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [reviewFrequency, setReviewFrequency] = useState<'quarterly' | 'bi_annual' | 'annual'>(
    clientData?.review_frequency || 'annual'
  );

  // Calculate data completeness for each property
  const dataCompleteness = useMemo(() => {
    const propertyData: PropertyDataQuality[] = properties.map(prop => {
      const missingFields: string[] = [];
      const issues: string[] = [];
      const warnings: string[] = [];

      // Check required fields
      REQUIRED_PROPERTY_FIELDS.forEach(field => {
        const value = prop[field];
        if (value === null || value === undefined || value === 0) {
          missingFields.push(field.replace(/_/g, ' '));
        }
      });

      // Check optional fields
      OPTIONAL_PROPERTY_FIELDS.forEach(field => {
        const value = prop[field];
        if (value === null || value === undefined) {
          warnings.push(`Missing ${field.replace(/_/g, ' ')}`);
        }
      });

      // Validation issues
      if (prop.value && prop.loan_remaining && prop.loan_remaining > prop.value) {
        issues.push('Loan exceeds property value');
      }
      
      if (prop.interest_rate && (prop.interest_rate < 1 || prop.interest_rate > 15)) {
        issues.push('Interest rate seems unusual');
      }

      const totalFields = REQUIRED_PROPERTY_FIELDS.length + OPTIONAL_PROPERTY_FIELDS.length;
      const filledFields = totalFields - missingFields.length - warnings.length;
      const completenessScore = Math.round((filledFields / totalFields) * 100);

      return {
        propertyId: prop.id,
        address: prop.address,
        missingFields,
        completenessScore,
        issues,
        warnings
      };
    });

    const totalMissingFields = propertyData.reduce((sum, p) => sum + p.missingFields.length, 0);
    const criticalIssues = propertyData.reduce((sum, p) => sum + p.issues.length, 0);
    const overallScore = propertyData.length > 0
      ? Math.round(propertyData.reduce((sum, p) => sum + p.completenessScore, 0) / propertyData.length)
      : 0;

    return {
      overallScore,
      propertyData,
      totalMissingFields,
      criticalIssues
    };
  }, [properties]);

  // Calculate metrics for each property
  const metrics = useMemo(() => {
    const propertyMetrics: PropertyMetrics[] = properties.map(prop => {
      const value = Number(prop.value) || 0;
      const loanRemaining = Number(prop.loan_remaining) || 0;
      const monthlyRental = Number(prop.monthly_rental_income) || 0;
      const monthlyExpenses = Number(prop.total_monthly_expenditure) || 0;
      const netCashflow = Number(prop.net_monthly_cashflow) || (monthlyRental - monthlyExpenses);

      const lvr = value > 0 ? (loanRemaining / value) * 100 : 0;
      const grossYield = value > 0 ? ((monthlyRental * 12) / value) * 100 : 0;
      const netYield = value > 0 ? ((netCashflow * 12) / value) * 100 : 0;

      return {
        propertyId: prop.id,
        address: prop.address,
        value,
        loanRemaining,
        lvr,
        monthlyRentalIncome: monthlyRental,
        totalMonthlyExpenditure: monthlyExpenses,
        netMonthlyCashflow: netCashflow,
        grossYield,
        netYield
      };
    });

    const totalValue = propertyMetrics.reduce((sum, p) => sum + p.value, 0);
    const totalDebt = propertyMetrics.reduce((sum, p) => sum + p.loanRemaining, 0);
    const totalEquity = totalValue - totalDebt;
    const portfolioLvr = totalValue > 0 ? (totalDebt / totalValue) * 100 : 0;
    const totalMonthlyCashflow = propertyMetrics.reduce((sum, p) => sum + p.netMonthlyCashflow, 0);
    const averageYield = propertyMetrics.length > 0
      ? propertyMetrics.reduce((sum, p) => sum + p.grossYield, 0) / propertyMetrics.length
      : 0;

    return {
      properties: propertyMetrics,
      portfolioTotals: {
        totalValue,
        totalDebt,
        totalEquity,
        portfolioLvr,
        totalMonthlyCashflow,
        averageYield
      }
    };
  }, [properties]);

  // Calculate scorecard
  const scorecard = useMemo(() => {
    const { portfolioTotals } = metrics;
    
    // Portfolio-level scores
    const portfolioHealth = Math.min(100, Math.max(0, 100 - portfolioTotals.portfolioLvr));
    const cashFlowScore = portfolioTotals.totalMonthlyCashflow >= 0
      ? Math.min(100, 50 + (portfolioTotals.totalMonthlyCashflow / 100))
      : Math.max(0, 50 + (portfolioTotals.totalMonthlyCashflow / 50));
    const growthPotential = Math.min(100, properties.length * 20 + (portfolioHealth * 0.3));
    const overallScore = Math.round((portfolioHealth * 0.4 + cashFlowScore * 0.4 + growthPotential * 0.2));

    // Risk assessment
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    const riskFactors: string[] = [];

    if (portfolioTotals.portfolioLvr > 80) {
      riskLevel = 'critical';
      riskFactors.push('Portfolio LVR exceeds 80%');
    } else if (portfolioTotals.portfolioLvr > 60) {
      riskLevel = 'high';
      riskFactors.push('Portfolio LVR is elevated (>60%)');
    } else if (portfolioTotals.portfolioLvr > 40) {
      riskLevel = 'medium';
      riskFactors.push('Portfolio LVR is moderate (>40%)');
    }

    if (portfolioTotals.totalMonthlyCashflow < 0) {
      if (riskLevel === 'low') riskLevel = 'medium';
      riskFactors.push('Negative portfolio cash flow');
    }

    // Property-level scores
    const propertyScores: PropertyScore[] = metrics.properties.map(prop => {
      const healthScore = Math.min(100, Math.max(0, 100 - prop.lvr));
      const propCashFlowScore = prop.netMonthlyCashflow >= 0
        ? Math.min(100, 50 + (prop.netMonthlyCashflow / 50))
        : Math.max(0, 50 + (prop.netMonthlyCashflow / 25));
      const propGrowthPotential = 50 + (healthScore * 0.3);
      const propOverallScore = Math.round((healthScore * 0.4 + propCashFlowScore * 0.4 + propGrowthPotential * 0.2));

      let classification: 'Star' | 'Good' | 'Average' | 'Underperformer' = 'Average';
      if (propOverallScore >= 80) classification = 'Star';
      else if (propOverallScore >= 60) classification = 'Good';
      else if (propOverallScore < 40) classification = 'Underperformer';

      const strengths: string[] = [];
      const concerns: string[] = [];

      if (prop.lvr < 50) strengths.push('Low leverage');
      if (prop.netMonthlyCashflow > 500) strengths.push('Strong cash flow');
      if (prop.grossYield > 5) strengths.push('Good rental yield');

      if (prop.lvr > 70) concerns.push('High leverage');
      if (prop.netMonthlyCashflow < 0) concerns.push('Negative cash flow');
      if (prop.grossYield < 3) concerns.push('Low rental yield');

      return {
        propertyId: prop.propertyId,
        address: prop.address,
        overallScore: propOverallScore,
        healthScore,
        cashFlowScore: propCashFlowScore,
        growthPotential: propGrowthPotential,
        classification,
        strengths,
        concerns
      };
    });

    return {
      overallScore,
      portfolioHealth,
      cashFlowScore,
      growthPotential,
      riskLevel,
      riskFactors,
      propertyScores
    };
  }, [metrics, properties.length]);

  // Generate validation flags
  const flags = useMemo(() => {
    const validationFlags: ValidationFlag[] = [];

    metrics.properties.forEach(prop => {
      // LVR flags
      if (prop.lvr > 90) {
        validationFlags.push({
          type: 'error',
          severity: 'critical',
          field: 'lvr',
          message: `LVR of ${prop.lvr.toFixed(1)}% is critically high`,
          propertyAddress: prop.address,
          recommendation: 'Urgently review debt reduction strategies'
        });
      } else if (prop.lvr > 80) {
        validationFlags.push({
          type: 'warning',
          severity: 'high',
          field: 'lvr',
          message: `LVR of ${prop.lvr.toFixed(1)}% exceeds 80%`,
          propertyAddress: prop.address,
          recommendation: 'Consider debt reduction or revaluation'
        });
      }

      // Cash flow flags
      if (prop.netMonthlyCashflow < -500) {
        validationFlags.push({
          type: 'error',
          severity: 'high',
          field: 'cashflow',
          message: `Significant negative cash flow of $${Math.abs(prop.netMonthlyCashflow).toFixed(0)}/month`,
          propertyAddress: prop.address,
          recommendation: 'Review expenses and consider rent increase'
        });
      } else if (prop.netMonthlyCashflow < 0) {
        validationFlags.push({
          type: 'warning',
          severity: 'medium',
          field: 'cashflow',
          message: `Negative cash flow of $${Math.abs(prop.netMonthlyCashflow).toFixed(0)}/month`,
          propertyAddress: prop.address,
          recommendation: 'Monitor expenses and rental income'
        });
      }

      // Yield flags
      if (prop.grossYield < 2) {
        validationFlags.push({
          type: 'warning',
          severity: 'medium',
          field: 'yield',
          message: `Very low gross yield of ${prop.grossYield.toFixed(2)}%`,
          propertyAddress: prop.address,
          recommendation: 'Review if rent is at market rate'
        });
      }
    });

    // Data quality flags
    dataCompleteness.propertyData.forEach(prop => {
      if (prop.issues.length > 0) {
        prop.issues.forEach(issue => {
          validationFlags.push({
            type: 'error',
            severity: 'high',
            field: 'data',
            message: issue,
            propertyAddress: prop.address
          });
        });
      }
    });

    return validationFlags;
  }, [metrics, dataCompleteness]);

  // Generate scenarios
  const scenarios = useMemo(() => {
    const baseScenarios: Scenario[] = [];
    const totalCashflow = metrics.portfolioTotals.totalMonthlyCashflow;
    const totalDebt = metrics.portfolioTotals.totalDebt;

    // Interest rate increase scenario
    const rateIncrease = 1; // 1% increase
    const monthlyInterestIncrease = (totalDebt * (rateIncrease / 100)) / 12;
    baseScenarios.push({
      name: '+1% Interest Rate',
      description: 'Impact of a 1% interest rate increase on portfolio',
      parameters: { rateChange: 1 },
      impact: {
        cashFlowChange: -monthlyInterestIncrease,
        newNetCashflow: totalCashflow - monthlyInterestIncrease
      }
    });

    // 2% rate increase
    const largeRateIncrease = (totalDebt * 0.02) / 12;
    baseScenarios.push({
      name: '+2% Interest Rate',
      description: 'Impact of a 2% interest rate increase on portfolio',
      parameters: { rateChange: 2 },
      impact: {
        cashFlowChange: -largeRateIncrease,
        newNetCashflow: totalCashflow - largeRateIncrease
      }
    });

    // Vacancy scenario
    const avgMonthlyRent = properties.length > 0
      ? metrics.properties.reduce((sum, p) => sum + p.monthlyRentalIncome, 0) / properties.length
      : 0;
    const vacancyLoss = (avgMonthlyRent * 4) / 12; // 4 weeks vacancy spread over year
    baseScenarios.push({
      name: '4 Weeks Vacancy',
      description: 'Impact of 4 weeks vacancy per property',
      parameters: { vacancyWeeks: 4 },
      impact: {
        cashFlowChange: -vacancyLoss * properties.length,
        newNetCashflow: totalCashflow - (vacancyLoss * properties.length)
      }
    });

    // Rent increase scenario
    const rentIncrease = metrics.properties.reduce((sum, p) => sum + p.monthlyRentalIncome * 0.05, 0);
    baseScenarios.push({
      name: '+5% Rent Increase',
      description: 'Impact of 5% rent increase across portfolio',
      parameters: { rentChange: 5 },
      impact: {
        cashFlowChange: rentIncrease,
        newNetCashflow: totalCashflow + rentIncrease
      }
    });

    return baseScenarios;
  }, [metrics, properties.length]);

  // Generate recommendations
  const recommendations = useMemo(() => {
    const recs: ReviewWizardData['recommendations'] = [];

    // Based on flags
    const criticalFlags = flags.filter(f => f.severity === 'critical');
    const highFlags = flags.filter(f => f.severity === 'high');

    if (criticalFlags.length > 0) {
      recs.push({
        priority: 'high',
        category: 'Risk Management',
        title: 'Address Critical Issues Immediately',
        description: `There are ${criticalFlags.length} critical issue(s) that require immediate attention.`,
        actionItems: criticalFlags.map(f => f.recommendation || f.message)
      });
    }

    if (highFlags.length > 0) {
      recs.push({
        priority: 'high',
        category: 'Risk Management',
        title: 'Review High Priority Flags',
        description: `${highFlags.length} high-priority flag(s) need review.`,
        actionItems: highFlags.map(f => f.recommendation || f.message).slice(0, 5)
      });
    }

    // Portfolio-level recommendations
    if (scorecard.riskLevel === 'high' || scorecard.riskLevel === 'critical') {
      recs.push({
        priority: 'high',
        category: 'Debt Management',
        title: 'Reduce Portfolio Leverage',
        description: 'Portfolio LVR is elevated. Consider strategies to reduce debt exposure.',
        actionItems: [
          'Review properties for potential equity release',
          'Consider debt reduction plan',
          'Explore refinancing options for better rates'
        ]
      });
    }

    if (metrics.portfolioTotals.totalMonthlyCashflow < 0) {
      recs.push({
        priority: 'high',
        category: 'Cash Flow',
        title: 'Improve Portfolio Cash Flow',
        description: 'Portfolio is currently cash flow negative.',
        actionItems: [
          'Review all property expenses for optimization',
          'Consider rent reviews across portfolio',
          'Evaluate underperforming properties'
        ]
      });
    }

    // Data quality recommendations
    if (dataCompleteness.overallScore < 80) {
      recs.push({
        priority: 'medium',
        category: 'Data Quality',
        title: 'Improve Data Completeness',
        description: `Data completeness is at ${dataCompleteness.overallScore}%. Better data enables better analysis.`,
        actionItems: dataCompleteness.propertyData
          .filter(p => p.missingFields.length > 0)
          .slice(0, 3)
          .map(p => `Update ${p.address}: add ${p.missingFields.slice(0, 3).join(', ')}`)
      });
    }

    // Underperformer recommendations
    const underperformers = scorecard.propertyScores.filter(p => p.classification === 'Underperformer');
    if (underperformers.length > 0) {
      recs.push({
        priority: 'medium',
        category: 'Portfolio Optimization',
        title: 'Review Underperforming Properties',
        description: `${underperformers.length} propert${underperformers.length === 1 ? 'y is' : 'ies are'} classified as underperforming.`,
        actionItems: underperformers.map(p => `Review ${p.address}: ${p.concerns.join(', ')}`)
      });
    }

    // Positive recommendations
    const stars = scorecard.propertyScores.filter(p => p.classification === 'Star');
    if (stars.length > 0) {
      recs.push({
        priority: 'low',
        category: 'Growth Strategy',
        title: 'Leverage Strong Performers',
        description: `${stars.length} propert${stars.length === 1 ? 'y is' : 'ies are'} performing exceptionally well.`,
        actionItems: [
          'Consider using equity from star performers for portfolio growth',
          'Review what makes these properties successful',
          'Apply learnings to improve other properties'
        ]
      });
    }

    return recs;
  }, [flags, scorecard, metrics, dataCompleteness]);

  // Navigation
  const steps: ReviewStep[] = [
    'data_completeness',
    'metrics_review',
    'scorecard',
    'flags_scenarios',
    'recommendations',
    'generate_report'
  ];

  const currentStepIndex = steps.indexOf(currentStep);
  const canGoNext = currentStepIndex < steps.length - 1;
  const canGoPrev = currentStepIndex > 0;

  const goNext = useCallback(() => {
    if (canGoNext) {
      setCurrentStep(steps[currentStepIndex + 1]);
    }
  }, [canGoNext, currentStepIndex, steps]);

  const goPrev = useCallback(() => {
    if (canGoPrev) {
      setCurrentStep(steps[currentStepIndex - 1]);
    }
  }, [canGoPrev, currentStepIndex, steps]);

  const goToStep = useCallback((step: ReviewStep) => {
    setCurrentStep(step);
  }, []);

  // Save review to database
  const saveReview = useCallback(async (status: 'draft' | 'in_progress' | 'pending_approval' | 'completed') => {
    setIsSaving(true);
    try {
      // Calculate next review date based on frequency
      const frequencyDays = reviewFrequency === 'quarterly' ? 90 : reviewFrequency === 'bi_annual' ? 180 : 365;
      const nextReviewDue = new Date();
      nextReviewDue.setDate(nextReviewDue.getDate() + frequencyDays);

      // Generate executive summary
      const executiveSummary = `Portfolio review for ${clientName} completed on ${new Date().toLocaleDateString()}. ` +
        `Overall portfolio score: ${scorecard.overallScore}/100. ` +
        `Risk level: ${scorecard.riskLevel}. ` +
        `Total portfolio value: $${metrics.portfolioTotals.totalValue.toLocaleString()}. ` +
        `Monthly cash flow: $${metrics.portfolioTotals.totalMonthlyCashflow.toLocaleString()}.`;

      const keyFindings = [
        `Portfolio consists of ${properties.length} properties worth $${metrics.portfolioTotals.totalValue.toLocaleString()}`,
        `Current LVR: ${metrics.portfolioTotals.portfolioLvr.toFixed(1)}%`,
        `Monthly net cash flow: $${metrics.portfolioTotals.totalMonthlyCashflow.toLocaleString()}`,
        `${scorecard.propertyScores.filter(p => p.classification === 'Star').length} star performer(s)`,
        `${flags.filter(f => f.severity === 'critical' || f.severity === 'high').length} high-priority issue(s) identified`
      ];

      const actionItems = recommendations
        .filter(r => r.priority === 'high')
        .flatMap(r => r.actionItems)
        .slice(0, 10);

      const reviewData = {
        client_id: clientId,
        status,
        review_frequency: reviewFrequency,
        overall_score: scorecard.overallScore,
        portfolio_health: scorecard.portfolioHealth,
        cash_flow_score: scorecard.cashFlowScore,
        growth_potential: scorecard.growthPotential,
        risk_level: scorecard.riskLevel,
        data_completeness_score: dataCompleteness.overallScore,
        data_issues: dataCompleteness.propertyData.flatMap(p => p.issues) as unknown as Json,
        validation_flags: flags as unknown as Json,
        executive_summary: executiveSummary,
        key_findings: keyFindings as unknown as Json,
        recommendations: recommendations as unknown as Json,
        action_items: actionItems as unknown as Json,
        property_scores: scorecard.propertyScores.map(ps => ({
          propertyId: ps.propertyId,
          address: ps.address,
          overallScore: ps.overallScore,
          healthScore: ps.healthScore,
          cashFlowScore: ps.cashFlowScore,
          growthPotential: ps.growthPotential,
          classification: ps.classification,
          strengths: ps.strengths,
          concerns: ps.concerns
        })) as unknown as Json,
        scenarios: scenarios as unknown as Json,
        next_review_due: nextReviewDue.toISOString()
      };

      let result: { id: string } | null = null;
      if (reviewId) {
        // Update existing review
        const { data, error } = await supabase
          .from('portfolio_reviews')
          .update(reviewData as any)
          .eq('id', reviewId)
          .select('id')
          .single();
        if (error) throw error;
        result = data;
      } else {
        // Create new review
        const { data, error } = await supabase
          .from('portfolio_reviews')
          .insert(reviewData as any)
          .select('id')
          .single();
        if (error) throw error;
        result = data;
        setReviewId(result.id);
      }

      // Update client's last review date and next due
      if (status === 'completed') {
        await supabase
          .from('clients')
          .update({
            last_review_date: new Date().toISOString(),
            next_review_due: nextReviewDue.toISOString(),
            review_frequency: reviewFrequency
          })
          .eq('id', clientId);
      }

      toast.success(status === 'completed' ? 'Review completed and saved' : 'Review saved as draft');
      return result.id;
    } catch (error: any) {
      console.error('Error saving review:', error);
      toast.error('Failed to save review: ' + error.message);
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [clientId, clientName, reviewId, reviewFrequency, scorecard, metrics, dataCompleteness, flags, recommendations, scenarios, properties.length]);

  return {
    // State
    currentStep,
    currentStepIndex,
    isLoading,
    isSaving,
    reviewId,
    reviewFrequency,
    setReviewFrequency,
    
    // Calculated data
    dataCompleteness,
    metrics,
    scorecard,
    flags,
    scenarios,
    recommendations,
    
    // Navigation
    steps,
    canGoNext,
    canGoPrev,
    goNext,
    goPrev,
    goToStep,
    
    // Actions
    saveReview
  };
}
