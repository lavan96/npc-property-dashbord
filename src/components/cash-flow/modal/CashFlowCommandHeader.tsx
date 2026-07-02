import { ReactNode } from 'react';
import { Calculator, GitCompare, MoreHorizontal, RotateCcw, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface CashFlowCommandHeaderProps {
  propertyAddress: string;
  isNewBuild: boolean;
  hasChanges: boolean;
  hasOverrides: boolean;
  isSaving: boolean;
  comparisonMode: boolean;
  comparisonCount: number;
  onResetAll: () => void;
  onSaveChanges: () => void;
  exportMenu: ReactNode;
}

export function CashFlowCommandHeader({
  propertyAddress,
  isNewBuild,
  hasChanges,
  hasOverrides,
  isSaving,
  comparisonMode,
  comparisonCount,
  onResetAll,
  onSaveChanges,
  exportMenu,
}: CashFlowCommandHeaderProps) {
  return (
    <DialogHeader className="space-y-0">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:items-center">
        <div className="min-w-0 space-y-2">
          <DialogTitle className="flex flex-wrap items-center gap-3 text-xl font-semibold tracking-tight md:text-2xl">
            <span className="inline-flex rounded-2xl bg-primary/10 p-2.5 text-primary shadow-sm ring-1 ring-primary/10">
              <Calculator className="h-5 w-5 shrink-0" />
            </span>
            <span>10-Year Cash Flow Analysis</span>
            <Badge
              variant={isNewBuild ? 'default' : 'secondary'}
              className="rounded-full px-3 py-1 text-xs font-medium"
            >
              {isNewBuild ? 'New Build' : 'Existing Property'}
            </Badge>
          </DialogTitle>
          <DialogDescription className="truncate text-sm text-muted-foreground md:text-base">
            {propertyAddress}
          </DialogDescription>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-center">
          {hasChanges ? (
            <Badge variant="outline" className="rounded-full border-warning/30 bg-warning/10 px-3 py-1 text-warning dark:bg-warning/30 dark:text-warning">
              Unsaved Changes
            </Badge>
          ) : (
            <Badge variant="outline" className="rounded-full border-success/30 bg-success/10 px-3 py-1 text-success dark:bg-success/30 dark:text-success">
              Saved
            </Badge>
          )}
          {isSaving && (
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              Saving...
            </Badge>
          )}
          {comparisonMode && (
            <Badge variant="outline" className="rounded-full border-info/30 bg-info/10 px-3 py-1 text-info dark:bg-info/30 dark:text-info">
              <GitCompare className="mr-1.5 h-3.5 w-3.5" />
              Comparing {comparisonCount} {comparisonCount === 1 ? 'property' : 'properties'}
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <Button
            variant="default"
            size="sm"
            onClick={onSaveChanges}
            disabled={isSaving || !hasChanges}
            className="min-h-10 flex-1 shrink-0 rounded-xl shadow-sm sm:flex-none"
          >
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>

          <div className="hidden md:block">
            {exportMenu}
          </div>

          <HeaderMoreMenu
            hasOverrides={hasOverrides}
            onResetAll={onResetAll}
            exportMenu={exportMenu}
          />
        </div>
      </div>
    </DialogHeader>
  );
}

function HeaderMoreMenu({ hasOverrides, onResetAll, exportMenu }: {
  hasOverrides: boolean;
  onResetAll: () => void;
  exportMenu: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-10 shrink-0 rounded-xl">
          <MoreHorizontal className="h-4 w-4 md:mr-2" />
          <span className="hidden md:inline">More</span>
          <span className="sr-only md:hidden">More actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 bg-background">
        <DropdownMenuLabel>Workspace actions</DropdownMenuLabel>
        <DropdownMenuItem onClick={onResetAll} disabled={!hasOverrides} className="cursor-pointer">
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset All
        </DropdownMenuItem>
        <DropdownMenuSeparator className="md:hidden" />
        <div className="px-2 py-1.5 md:hidden">
          {exportMenu}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
