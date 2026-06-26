import { ReactNode } from 'react';
import { Calculator, Download, MoreHorizontal, Printer, RotateCcw, Save, Send } from 'lucide-react';
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
  onResetAll: () => void;
  onSaveChanges: () => void;
  onExportExcel: () => void;
  onPrintView: () => void;
  onSendToClient: () => void;
  pdfExportMenu: ReactNode;
}

export function CashFlowCommandHeader({
  propertyAddress,
  isNewBuild,
  hasChanges,
  hasOverrides,
  isSaving,
  onResetAll,
  onSaveChanges,
  onExportExcel,
  onPrintView,
  onSendToClient,
  pdfExportMenu,
}: CashFlowCommandHeaderProps) {
  return (
    <DialogHeader className="space-y-0">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-lg md:text-xl">
            <span className="inline-flex rounded-xl bg-primary/10 p-2 text-primary">
              <Calculator className="h-5 w-5 shrink-0" />
            </span>
            Cash Flow Analysis
            <Badge
              variant={isNewBuild ? "default" : "secondary"}
              className="text-xs"
            >
              {isNewBuild ? "New Build" : "Existing Property"}
            </Badge>
          </DialogTitle>
          <DialogDescription className="truncate text-sm">
            {propertyAddress}
          </DialogDescription>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center lg:justify-end">
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            {hasChanges ? (
              <Badge variant="outline" className="border-orange-300 text-orange-600">
                Unsaved Changes
              </Badge>
            ) : (
              <Badge variant="outline" className="border-emerald-200 text-emerald-700">
                Saved
              </Badge>
            )}
            {isSaving && (
              <Badge variant="secondary">
                Saving...
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={onSaveChanges}
              disabled={isSaving || !hasChanges}
              className="shrink-0"
            >
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>

            <div className="hidden md:block">
              {pdfExportMenu}
            </div>

            <HeaderMoreMenu
              hasOverrides={hasOverrides}
              onResetAll={onResetAll}
              onExportExcel={onExportExcel}
              onPrintView={onPrintView}
              onSendToClient={onSendToClient}
              pdfExportMenu={pdfExportMenu}
            />
          </div>
        </div>
      </div>
    </DialogHeader>
  );
}

function HeaderMoreMenu({ hasOverrides, onResetAll, onExportExcel, onPrintView, onSendToClient, pdfExportMenu }: {
  hasOverrides: boolean;
  onResetAll: () => void;
  onExportExcel: () => void;
  onPrintView: () => void;
  onSendToClient: () => void;
  pdfExportMenu: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0">
          <MoreHorizontal className="h-4 w-4 md:mr-2" />
          <span className="hidden md:inline">More</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 bg-background">
        <DropdownMenuLabel>Workspace actions</DropdownMenuLabel>
        <DropdownMenuItem onClick={onResetAll} disabled={!hasOverrides}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset All
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExportExcel}>
          <Download className="mr-2 h-4 w-4" />
          Export Excel
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 md:hidden">
          {pdfExportMenu}
        </div>
        <DropdownMenuSeparator className="md:hidden" />
        <DropdownMenuItem onClick={onPrintView}>
          <Printer className="mr-2 h-4 w-4" />
          Print View
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onSendToClient}>
          <Send className="mr-2 h-4 w-4" />
          Send to Client
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
