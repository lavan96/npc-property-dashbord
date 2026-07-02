import { BarChart3, MapPin, TrendingUp, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DashboardThemeFrame } from '@/components/layout/DashboardThemeFrame';

interface ReportLibraryTabsProps {
  isMobile: boolean;
  quantitativeCount: number;
  investmentCount: number;
  comparisonCount: number;
}

const workspaceTabs: Array<{
  value: 'quantitative' | 'investment' | 'comparisons';
  label: string;
  mobileLabel: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    value: 'quantitative',
    label: 'Quantitative',
    mobileLabel: 'Quant.',
    description: 'Market charts, KPIs, and listing analytics',
    icon: BarChart3,
  },
  {
    value: 'investment',
    label: 'Investment',
    mobileLabel: 'Invest',
    description: 'Property, suburb, postcode, and state intelligence',
    icon: TrendingUp,
  },
  {
    value: 'comparisons',
    label: 'Comparisons',
    mobileLabel: 'Compare',
    description: 'Multi-property decision analysis',
    icon: MapPin,
  },
];

export function ReportLibraryTabs({ isMobile, quantitativeCount, investmentCount, comparisonCount }: ReportLibraryTabsProps) {
  const counts = {
    quantitative: quantitativeCount,
    investment: investmentCount,
    comparisons: comparisonCount,
  };

  return (
    <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
      <DashboardThemeFrame variant="toolbar" className="min-w-max p-1.5 md:min-w-0">
        <TabsList className={isMobile ? 'inline-flex h-auto w-auto min-w-full gap-2 bg-transparent p-0' : 'grid h-auto w-full grid-cols-3 gap-2 bg-transparent p-0'}>
          {workspaceTabs.map(({ value, label, mobileLabel, description, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="group h-auto min-w-[9.5rem] justify-start rounded-xl border border-transparent bg-background/55 p-3 text-left shadow-sm transition-all hover:border-primary/20 hover:bg-background/80 data-[state=active]:border-brand-400/40 data-[state=active]:bg-gradient-to-br data-[state=active]:from-brand-500/15 data-[state=active]:via-background data-[state=active]:to-primary/10 data-[state=active]:text-foreground data-[state=active]:shadow-md data-[state=active]:shadow-primary/10 md:min-w-0 md:p-4"
            >
              <div className="flex w-full items-start gap-3">
                <span className="mt-0.5 rounded-lg border border-border/60 bg-card p-2 text-muted-foreground transition-colors group-data-[state=active]:border-brand-400/40 group-data-[state=active]:bg-brand-500/10 group-data-[state=active]:text-brand-700 dark:group-data-[state=active]:text-brand-300">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold leading-none">
                      <span className="hidden sm:inline">{label}</span>
                      <span className="sm:hidden">{mobileLabel}</span>
                    </span>
                    <Badge variant="secondary" className="rounded-full px-2 py-0 text-[11px] font-semibold">
                      {counts[value]}
                    </Badge>
                  </span>
                  <span className="hidden text-xs font-normal leading-5 text-muted-foreground md:block">
                    {description}
                  </span>
                </span>
              </div>
            </TabsTrigger>
          ))}
        </TabsList>
      </DashboardThemeFrame>
    </div>
  );
}
