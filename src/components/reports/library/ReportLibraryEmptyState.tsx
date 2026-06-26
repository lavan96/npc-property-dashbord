import { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ReportLibraryEmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  actionIcon?: ReactNode;
  onAction?: () => void;
}

export function ReportLibraryEmptyState({ icon, title, description, actionLabel, actionIcon, onAction }: ReportLibraryEmptyStateProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center h-96 space-y-4">
        <div className="text-6xl text-muted-foreground">{icon}</div>
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-muted-foreground">{description}</p>
        </div>
        {actionLabel && onAction && (
          <Button onClick={onAction} className="mt-4">
            {actionIcon}
            {actionLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
