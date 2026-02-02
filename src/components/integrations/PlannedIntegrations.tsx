import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Calendar, Database, DollarSign, MapPin, AlertCircle } from 'lucide-react';

interface PlannedIntegration {
  id: string;
  name: string;
  description: string;
  purpose: string;
  estimatedCost: string;
  priority: 'high' | 'medium' | 'low';
  status: 'planned' | 'researching' | 'pending_budget';
  icon: React.ReactNode;
}

const plannedIntegrations: PlannedIntegration[] = [
  {
    id: 'corelogic',
    name: 'CoreLogic RP Data',
    description: 'Comprehensive property transaction database',
    purpose: 'Enable verified comparable sales data with actual settlement prices, dates, and property addresses for investment reports',
    estimatedCost: 'Enterprise pricing - contact for quote',
    priority: 'high',
    status: 'pending_budget',
    icon: <Database className="h-5 w-5" />,
  },
  {
    id: 'pricefinder',
    name: 'Pricefinder',
    description: 'Real-time property data and valuations',
    purpose: 'Access to comparable rental evidence with actual lease data, property history, and automated valuation models (AVM)',
    estimatedCost: '$200-500/month per user',
    priority: 'high',
    status: 'researching',
    icon: <DollarSign className="h-5 w-5" />,
  },
  {
    id: 'nearmap',
    name: 'Nearmap',
    description: 'High-resolution aerial imagery',
    purpose: 'Include current aerial property images in reports, track development changes over time',
    estimatedCost: 'Enterprise pricing - contact for quote',
    priority: 'medium',
    status: 'planned',
    icon: <MapPin className="h-5 w-5" />,
  },
];

const getPriorityBadge = (priority: string) => {
  switch (priority) {
    case 'high':
      return <Badge variant="destructive">High Priority</Badge>;
    case 'medium':
      return <Badge variant="default">Medium</Badge>;
    case 'low':
      return <Badge variant="secondary">Low</Badge>;
    default:
      return <Badge variant="outline">{priority}</Badge>;
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'pending_budget':
      return <Badge variant="outline" className="border-warning text-warning">Pending Budget</Badge>;
    case 'researching':
      return <Badge variant="outline" className="border-primary text-primary">Researching</Badge>;
    case 'planned':
      return <Badge variant="outline">Planned</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export function PlannedIntegrations() {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <div>
            <CardTitle className="text-lg">Future Integrations Roadmap</CardTitle>
            <CardDescription>
              Planned paid API integrations for enhanced reporting capabilities
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Important Note */}
        <div className="flex items-start gap-3 p-3 bg-warning/10 border border-warning/20 rounded-lg">
          <AlertCircle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-warning">Data Sourcing Note</p>
            <p className="text-muted-foreground mt-1">
              Currently, individual comparable sales and rental data in investment reports are based on 
              suburb-level statistics. Specific property addresses and transaction details require integration 
              with paid data providers listed below.
            </p>
          </div>
        </div>

        <Separator />

        {/* Planned Integrations List */}
        <div className="space-y-4">
          {plannedIntegrations.map((integration) => (
            <div
              key={integration.id}
              className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-4 rounded-lg border bg-muted/30"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-background border">
                  {integration.icon}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-medium">{integration.name}</h4>
                    {getPriorityBadge(integration.priority)}
                    {getStatusBadge(integration.status)}
                  </div>
                  <p className="text-sm text-muted-foreground">{integration.description}</p>
                  <p className="text-sm mt-2">
                    <span className="font-medium">Purpose: </span>
                    {integration.purpose}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    <span className="font-medium">Est. Cost: </span>
                    {integration.estimatedCost}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Developer Notes */}
        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Developer Notes: </span>
            When integrating these APIs, update the <code className="bg-background px-1 rounded">generate-investment-report</code> edge 
            function to fetch verified transaction data and remove the disclaimer about comparable data limitations. 
            Search for <code className="bg-background px-1 rounded">TODO: Re-enable when transaction data APIs are integrated</code> in the codebase.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
