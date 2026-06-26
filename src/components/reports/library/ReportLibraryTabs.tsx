import { BarChart3, MapPin, TrendingUp } from 'lucide-react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ReportLibraryTabsProps {
  isMobile: boolean;
}

export function ReportLibraryTabs({ isMobile }: ReportLibraryTabsProps) {
  return (
    <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
      <TabsList className={isMobile ? "inline-flex w-auto min-w-full" : "grid w-full grid-cols-3"}>
        <TabsTrigger value="quantitative" className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm whitespace-nowrap">
          <BarChart3 className="h-3.5 w-3.5 md:h-4 md:w-4" />
          <span className="hidden sm:inline">Quantitative</span>
          <span className="sm:hidden">Quant.</span>
        </TabsTrigger>
        <TabsTrigger value="investment" className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm whitespace-nowrap">
          <TrendingUp className="h-3.5 w-3.5 md:h-4 md:w-4" />
          Investment
        </TabsTrigger>
        <TabsTrigger value="comparisons" className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm whitespace-nowrap">
          <MapPin className="h-3.5 w-3.5 md:h-4 md:w-4" />
          <span className="hidden sm:inline">Comparisons</span>
          <span className="sm:hidden">Compare</span>
        </TabsTrigger>
      </TabsList>
    </div>
  );
}
