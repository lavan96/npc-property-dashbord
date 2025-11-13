import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, BarChart3, Trash2 } from 'lucide-react';
import { useComparison } from '@/contexts/ComparisonContext';
import { format } from 'date-fns';

interface ComparisonBasketProps {
  onCompare: () => void;
}

export function ComparisonBasket({ onCompare }: ComparisonBasketProps) {
  const { selectedReports, removeReport, clearSelection } = useComparison();
  const [isExpanded, setIsExpanded] = useState(false);

  if (selectedReports.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {!isExpanded ? (
        // Collapsed floating button
        <Button
          size="lg"
          onClick={() => setIsExpanded(true)}
          className="rounded-full shadow-lg hover:shadow-xl transition-all relative"
        >
          <BarChart3 className="h-5 w-5 mr-2" />
          Compare Properties
          <Badge 
            variant="secondary" 
            className="ml-2 bg-primary-foreground text-primary"
          >
            {selectedReports.length}/5
          </Badge>
        </Button>
      ) : (
        // Expanded basket card
        <Card className="w-[400px] shadow-2xl">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Comparison Basket
                </CardTitle>
                <CardDescription>
                  {selectedReports.length} of 5 properties selected
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsExpanded(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ScrollArea className="h-[280px] pr-4">
              <div className="space-y-2">
                {selectedReports.map((report, index) => (
                  <div
                    key={report.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <Badge variant="outline" className="mt-1">
                      {index + 1}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight line-clamp-2">
                        {report.property_address}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(report.created_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 flex-shrink-0"
                      onClick={() => removeReport(report.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="pt-3 space-y-2 border-t">
              <Button
                onClick={onCompare}
                disabled={selectedReports.length < 2}
                className="w-full"
                size="lg"
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                Compare {selectedReports.length} Properties
              </Button>
              <Button
                variant="outline"
                onClick={clearSelection}
                className="w-full"
                size="sm"
              >
                <Trash2 className="h-3 w-3 mr-2" />
                Clear All
              </Button>
              {selectedReports.length < 2 && (
                <p className="text-xs text-muted-foreground text-center">
                  Select at least 2 properties to compare
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
