import { useState, useMemo } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter,
  SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { IncomeSourceForm } from './income/IncomeSourceForm';
import { IncomeSourceCard } from './income/IncomeSourceCard';
import {
  IncomeSource,
  convertToAnnual,
  getSourceTotalAnnual,
  getEffectiveShading,
  formatCurrency,
  defaultIncomeSource,
} from './income/incomeSourceTypes';

interface IncomeManualEntryProps {
  clientId: string;
  onComplete: () => void;
}

export function IncomeManualEntry({ clientId, onComplete }: IncomeManualEntryProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'primary' | 'secondary'>('primary');
  const [editingSource, setEditingSource] = useState<IncomeSource | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const queryClient = useQueryClient();

  // Fetch income sources
  const { data: incomeSources = [] } = useQuery<IncomeSource[]>({
    queryKey: ['client-income-sources', clientId],
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction('get-client-data', {
        clientId,
        include: { incomeSources: true, client: false, properties: false, employment: false, income: false, assets: false, liabilities: false, expenses: false },
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error('Failed to fetch income sources');
      return data.incomeSources || [];
    },
  });

  const primarySources = useMemo(() => incomeSources.filter(s => s.contact_type === 'primary'), [incomeSources]);
  const secondarySources = useMemo(() => incomeSources.filter(s => s.contact_type === 'secondary'), [incomeSources]);
  
  const primaryTotal = useMemo(() => primarySources.reduce((sum, s) => sum + getSourceTotalAnnual(s), 0), [primarySources]);
  const secondaryTotal = useMemo(() => secondarySources.reduce((sum, s) => sum + getSourceTotalAnnual(s), 0), [secondarySources]);
  const combinedTotal = primaryTotal + secondaryTotal;

  const saveMutation = useMutation({
    mutationFn: async (source: IncomeSource) => {
      const { id, client_id, ...payload } = source;
      const { data, error } = await invokeSecureFunction('manage-client-data', {
        operation: id ? 'update' : 'create',
        table: 'client_income_sources',
        clientId,
        recordId: id,
        data: payload,
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Failed to save');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-income-sources', clientId] });
      queryClient.invalidateQueries({ queryKey: ['borrowing-capacity-client-data', clientId] });
      setEditingSource(null);
      setIsAdding(false);
      toast.success('Income source saved');
    },
    onError: (err: any) => toast.error('Failed to save: ' + err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      const { data, error } = await invokeSecureFunction('manage-client-data', {
        operation: 'delete',
        table: 'client_income_sources',
        clientId,
        recordId: sourceId,
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Failed to delete');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-income-sources', clientId] });
      queryClient.invalidateQueries({ queryKey: ['borrowing-capacity-client-data', clientId] });
      toast.success('Income source removed');
    },
    onError: (err: any) => toast.error('Failed to delete: ' + err.message),
  });

  const currentSources = activeTab === 'primary' ? primarySources : secondarySources;
  const showForm = isAdding || editingSource !== null;

  return (
    <div className="space-y-4">
      {/* Income Summary Display */}
      {incomeSources.length > 0 ? (
        <div className="space-y-2">
          <Card className="bg-success/10 border-success/20">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4 text-success" />
                <span className="font-medium text-success">Total Household Income</span>
              </div>
              <p className="text-2xl font-bold text-success">{formatCurrency(combinedTotal)}/year</p>
              <p className="text-sm text-muted-foreground">
                {formatCurrency(combinedTotal / 12)}/month • {incomeSources.length} source{incomeSources.length !== 1 ? 's' : ''}
              </p>
            </CardContent>
          </Card>
          
          <div className="grid grid-cols-2 gap-2">
            {primarySources.length > 0 && (
              <Card>
                <CardContent className="pt-3">
                  <p className="text-xs text-muted-foreground">Primary ({primarySources.length})</p>
                  <p className="font-medium">{formatCurrency(primaryTotal)}/yr</p>
                </CardContent>
              </Card>
            )}
            {secondarySources.length > 0 && (
              <Card>
                <CardContent className="pt-3">
                  <p className="text-xs text-muted-foreground">Secondary ({secondarySources.length})</p>
                  <p className="font-medium">{formatCurrency(secondaryTotal)}/yr</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-4 text-muted-foreground">
          <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No income sources</p>
        </div>
      )}

      <Sheet open={open} onOpenChange={(v) => {
        setOpen(v);
        if (!v) { setEditingSource(null); setIsAdding(false); }
      }}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            {incomeSources.length > 0 ? 'Manage Income Sources' : 'Add Income Sources'}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Income Sources
            </SheetTitle>
            <SheetDescription>
              Add multiple income sources for each contact
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-180px)] pr-4 mt-4">
            {showForm ? (
              <IncomeSourceForm
                source={editingSource || undefined}
                contactType={activeTab}
                onSave={(source) => saveMutation.mutate(source)}
                onCancel={() => { setEditingSource(null); setIsAdding(false); }}
                isPending={saveMutation.isPending}
              />
            ) : (
              <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="primary">
                    Primary ({primarySources.length})
                  </TabsTrigger>
                  <TabsTrigger value="secondary">
                    Secondary ({secondarySources.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value={activeTab} className="mt-4 space-y-3">
                  {currentSources.map(source => (
                    <IncomeSourceCard
                      key={source.id}
                      source={source}
                      onEdit={() => setEditingSource(source)}
                      onDelete={() => source.id && deleteMutation.mutate(source.id)}
                    />
                  ))}

                  {currentSources.length === 0 && (
                    <div className="text-center py-6 text-muted-foreground">
                      <p className="text-sm">No {activeTab} income sources yet</p>
                    </div>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setIsAdding(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add {activeTab === 'primary' ? 'Primary' : 'Secondary'} Income Source
                  </Button>
                </TabsContent>
              </Tabs>
            )}
          </ScrollArea>

          <SheetFooter className="pt-4">
            <Button variant="outline" onClick={() => { setOpen(false); onComplete(); }}>
              Done
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
