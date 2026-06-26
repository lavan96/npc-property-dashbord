import { Badge } from '@/components/ui/badge';

interface ReportLibraryHeroProps {
  quantitativeCount: number;
  investmentCount: number;
}

export function ReportLibraryHero({ quantitativeCount, investmentCount }: ReportLibraryHeroProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:space-y-2">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Generated Reports</h2>
        <p className="text-sm md:text-base text-muted-foreground">
          View and download your generated property reports
        </p>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Badge variant="secondary" className="text-xs">{quantitativeCount} quantitative</Badge>
        <Badge variant="outline" className="text-xs">{investmentCount} investment</Badge>
      </div>
    </div>
  );
}
