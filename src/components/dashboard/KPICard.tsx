import { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface KPICardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  description?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
  compact?: boolean;
}

export function KPICard({ 
  title, 
  value, 
  icon, 
  description, 
  trend, 
  className,
  compact = false 
}: KPICardProps) {
  return (
    <Card className={cn("", className)}>
      <CardHeader className={cn(
        "flex flex-row items-center justify-between space-y-0",
        compact ? "pb-1 pt-3 px-3" : "pb-2"
      )}>
        <CardTitle className={cn(
          "font-medium text-muted-foreground",
          compact ? "text-xs" : "text-sm"
        )}>
          {title}
        </CardTitle>
        {icon && (
          <div className={cn(
            "text-muted-foreground",
            compact ? "h-3.5 w-3.5" : "h-4 w-4"
          )}>
            {icon}
          </div>
        )}
      </CardHeader>
      <CardContent className={compact ? "pb-3 px-3" : ""}>
        <div className={cn(
          "font-bold text-foreground",
          compact ? "text-lg" : "text-2xl"
        )}>
          {value}
        </div>
        {description && !compact && (
          <p className="text-xs text-muted-foreground mt-1">
            {description}
          </p>
        )}
        {trend && (
          <div className={cn(
            "flex items-center text-xs mt-1",
            trend.isPositive ? "text-success" : "text-destructive"
          )}>
            <span>
              {trend.isPositive ? "+" : ""}{trend.value}%
            </span>
            <span className="text-muted-foreground ml-1">from last period</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}