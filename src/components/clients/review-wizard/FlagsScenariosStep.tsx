import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  AlertCircle, 
  AlertTriangle, 
  Info,
  TrendingUp,
  TrendingDown,
  Percent,
  Calendar
} from 'lucide-react';
import type { ValidationFlag, Scenario } from './types';

interface FlagsScenariosStepProps {
  flags: ValidationFlag[];
  scenarios: Scenario[];
}

export function FlagsScenariosStep({ flags, scenarios }: FlagsScenariosStepProps) {
  const criticalFlags = flags.filter(f => f.severity === 'critical');
  const highFlags = flags.filter(f => f.severity === 'high');
  const mediumFlags = flags.filter(f => f.severity === 'medium');
  const lowFlags = flags.filter(f => f.severity === 'low');

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case 'high':
        return <AlertTriangle className="h-4 w-4 text-orange-600" />;
      case 'medium':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      default:
        return <Info className="h-4 w-4 text-blue-600" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">Critical</Badge>;
      case 'high':
        return <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20">High</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Medium</Badge>;
      default:
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Low</Badge>;
    }
  };

  const formatCurrency = (value: number) => {
    const absValue = Math.abs(value);
    const sign = value >= 0 ? '+' : '-';
    return `${sign}$${absValue.toLocaleString()}`;
  };

  return (
    <div className="space-y-6">
      {/* Flags Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card className={criticalFlags.length > 0 ? 'border-red-300 bg-red-50/50' : ''}>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold text-red-600">{criticalFlags.length}</div>
            <p className="text-xs text-muted-foreground">Critical</p>
          </CardContent>
        </Card>
        <Card className={highFlags.length > 0 ? 'border-orange-300 bg-orange-50/50' : ''}>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold text-orange-600">{highFlags.length}</div>
            <p className="text-xs text-muted-foreground">High</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">{mediumFlags.length}</div>
            <p className="text-xs text-muted-foreground">Medium</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{lowFlags.length}</div>
            <p className="text-xs text-muted-foreground">Low</p>
          </CardContent>
        </Card>
      </div>

      {/* Validation Flags */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Validation Flags</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {flags.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No validation flags - all data looks good!</p>
            </div>
          ) : (
            <>
              {/* Critical & High first */}
              {[...criticalFlags, ...highFlags].map((flag, i) => (
                <div key={i} className="border rounded-lg p-3 space-y-2 bg-red-50/30">
                  <div className="flex items-start gap-3">
                    {getSeverityIcon(flag.severity)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getSeverityBadge(flag.severity)}
                        <Badge variant="outline" className="text-xs">{flag.field}</Badge>
                      </div>
                      <p className="text-sm mt-1">{flag.message}</p>
                      {flag.propertyAddress && (
                        <p className="text-xs text-muted-foreground mt-1">{flag.propertyAddress}</p>
                      )}
                      {flag.recommendation && (
                        <p className="text-xs text-blue-600 mt-1">→ {flag.recommendation}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Medium & Low */}
              {[...mediumFlags, ...lowFlags].map((flag, i) => (
                <div key={i} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-start gap-3">
                    {getSeverityIcon(flag.severity)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getSeverityBadge(flag.severity)}
                        <Badge variant="outline" className="text-xs">{flag.field}</Badge>
                      </div>
                      <p className="text-sm mt-1">{flag.message}</p>
                      {flag.propertyAddress && (
                        <p className="text-xs text-muted-foreground mt-1">{flag.propertyAddress}</p>
                      )}
                      {flag.recommendation && (
                        <p className="text-xs text-blue-600 mt-1">→ {flag.recommendation}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      {/* Scenarios */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">What-If Scenarios</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            See how different market conditions could impact your portfolio cash flow.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            {scenarios.map((scenario, i) => (
              <div key={i} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  {scenario.impact.cashFlowChange >= 0 ? (
                    <TrendingUp className="h-5 w-5 text-green-600" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-red-600" />
                  )}
                  <h4 className="font-medium">{scenario.name}</h4>
                </div>
                
                <p className="text-xs text-muted-foreground">{scenario.description}</p>
                
                <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                  <div>
                    <p className="text-xs text-muted-foreground">Cash Flow Impact</p>
                    <p className={`text-lg font-bold ${
                      scenario.impact.cashFlowChange >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatCurrency(scenario.impact.cashFlowChange)}/mo
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">New Monthly CF</p>
                    <p className={`text-lg font-bold ${
                      scenario.impact.newNetCashflow >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      ${scenario.impact.newNetCashflow.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
