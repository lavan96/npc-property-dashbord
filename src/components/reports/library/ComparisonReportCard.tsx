import { format } from 'date-fns';
import { Archive, ArchiveRestore, Calendar, Eye, MapPin, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ComparisonAnalysis } from './types';

interface ComparisonReportCardProps {
  comparison: ComparisonAnalysis & { is_archived?: boolean };
  generatorLabel: (id?: string | null) => string;
  onView: (comparison: ComparisonAnalysis) => void;
  onToggleArchive: (comparisonId: string, archive: boolean) => void;
}

export function ComparisonReportCard({ comparison, generatorLabel, onView, onToggleArchive }: ComparisonReportCardProps) {
  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" /><span className="flex-1 line-clamp-2">{comparison.report_title || `${comparison.property_count} Property Comparison`}</span></CardTitle>
        <CardDescription className="space-y-1">
          <div className="flex items-center gap-2"><Calendar className="h-3 w-3" />{format(new Date(comparison.created_at), 'MMM dd, yyyy')}</div>
          <div className="flex items-center gap-2"><User className="h-3 w-3" />Created by {generatorLabel(comparison.created_by)}</div>
          {comparison.property_states && comparison.property_states.length > 0 && <div className="text-xs">States: {comparison.property_states.join(', ')}</div>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {comparison.executive_summary && <p className="text-sm text-muted-foreground line-clamp-3">{comparison.executive_summary}</p>}
        {comparison.rankings && comparison.rankings.length > 0 && <div className="space-y-1"><p className="text-xs font-medium">Top Ranked:</p><Badge variant="default">{comparison.rankings[0]?.address || `Property #${comparison.rankings[0]?.propertyNumber}`}</Badge></div>}
        <div className="flex gap-2 mt-4">
          <Button variant="default" size="sm" onClick={() => onView(comparison)} className="flex-1"><Eye className="mr-1 h-3 w-3" />View Analysis</Button>
          <Button variant="ghost" size="sm" onClick={() => onToggleArchive(comparison.id, !comparison.is_archived)} title={comparison.is_archived ? 'Restore comparison' : 'Archive comparison'} className="px-2">
            {comparison.is_archived ? <ArchiveRestore className="h-3 w-3 text-green-600" /> : <Archive className="h-3 w-3 text-muted-foreground" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
