import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ArrowLeft, CheckCircle2, Trash2, Archive } from 'lucide-react';
import { useChecklistInstanceItems, useChecklistMutations, type ChecklistInstance } from '@/hooks/useChecklists';
import { logActivityDirect } from '@/hooks/useActivityLogger';

interface ChecklistInstanceViewProps {
  instance: ChecklistInstance;
  onBack: () => void;
}

export function ChecklistInstanceView({ instance, onBack }: ChecklistInstanceViewProps) {
  const { data: items = [], isLoading } = useChecklistInstanceItems(instance.id);
  const mutations = useChecklistMutations();

  // Group items by section
  const sections = useMemo(() => {
    const grouped = new Map<string, typeof items>();
    for (const item of items) {
      const key = `${item.section_order}_${item.section_title}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(item);
    }
    return Array.from(grouped.entries())
      .sort(([a], [b]) => {
        const orderA = parseInt(a.split('_')[0]);
        const orderB = parseInt(b.split('_')[0]);
        return orderA - orderB;
      })
      .map(([key, sectionItems]) => ({
        title: sectionItems[0].section_title,
        icon: sectionItems[0].section_icon,
        items: sectionItems.sort((a, b) => a.display_order - b.display_order),
      }));
  }, [items]);

  const checkedCount = items.filter(i => i.is_checked).length;
  const totalCount = items.length;
  const progress = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  const handleToggleItem = (itemId: string, currentChecked: boolean) => {
    const nextChecked = !currentChecked;
    const newChecked = currentChecked ? checkedCount - 1 : checkedCount + 1;
    const newProgress = totalCount > 0 ? Math.round((newChecked / totalCount) * 100) : 0;
    const isCompleted = totalCount > 0 && newProgress === 100;
    const completedAt = isCompleted ? (instance.completed_at || new Date().toISOString()) : null;

    mutations.updateInstanceItem.mutate(
      {
        id: itemId,
        is_checked: nextChecked,
        checked_at: nextChecked ? new Date().toISOString() : null,
      },
      {
        onSuccess: () => {
          mutations.updateInstance.mutate({
            id: instance.id,
            progress_percent: newProgress,
            status: isCompleted ? 'completed' : 'in_progress',
            completed_at: completedAt,
          });

          if (isCompleted) {
            logActivityDirect({
              actionType: 'checklist_completed',
              entityType: 'checklist',
              entityId: instance.id,
              entityName: instance.name,
            });
          }
        },
      },
    );
  };

  const handleArchive = () => {
    mutations.updateInstance.mutate(
      { id: instance.id, status: 'archived', archived_at: new Date().toISOString() },
      { onSuccess: onBack },
    );
  };

  const handleDelete = () => {
    mutations.deleteInstance.mutate(instance.id, { onSuccess: onBack });
  };

  return (
    <div className="space-y-6 rounded-3xl border border-amber-500/10 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.14),transparent_34%),linear-gradient(180deg,#09090b,#030303)] p-4 text-zinc-100 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-bold text-zinc-50">
              <span className="text-2xl">{instance.icon}</span>
              {instance.name}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={instance.status === 'completed' ? 'default' : instance.status === 'archived' ? 'secondary' : 'outline'}>
                {instance.status === 'completed' ? <><CheckCircle2 className="h-3 w-3 mr-1" /> Completed</> : instance.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Created {new Date(instance.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleArchive}
            className="gap-1"
            disabled={mutations.updateInstance.isPending}
          >
            <Archive className="h-3 w-3" /> Archive
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1 text-destructive hover:text-destructive">
                <Trash2 className="h-3 w-3" /> Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Checklist Instance</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete this generated checklist instance and all its items. The parent template remains available in Templates.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={mutations.deleteInstance.isPending}>Delete Instance</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Progress */}
      <Card className="border-amber-500/15 bg-zinc-950/90 shadow-lg shadow-black/30">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{checkedCount} of {totalCount} completed</span>
            <span className="text-sm font-bold text-primary">{progress}%</span>
          </div>
          <Progress value={progress} className="h-3 bg-zinc-800 [&>div]:bg-gradient-to-r [&>div]:from-amber-500 [&>div]:to-yellow-300" />
        </CardContent>
      </Card>

      {/* Sections & Items */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading checklist items...</p>
      ) : sections.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">This checklist has no items.</p>
      ) : (
        sections.map((section, idx) => {
          const sectionChecked = section.items.filter(i => i.is_checked).length;
          const sectionTotal = section.items.length;

          return (
            <Card key={idx} className="border-amber-500/15 bg-zinc-950/90 shadow-lg shadow-black/30">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
                    <span>{section.icon}</span>
                    {section.title}
                  </CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {sectionChecked}/{sectionTotal}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                {section.items.map(item => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 py-2 px-3 rounded-md transition-all cursor-pointer hover:bg-amber-500/10 ${item.is_checked ? 'opacity-60' : ''}`}
                    onClick={() => handleToggleItem(item.id, item.is_checked)}
                  >
                    <Checkbox
                      checked={item.is_checked}
                      onCheckedChange={() => handleToggleItem(item.id, item.is_checked)}
                      className="pointer-events-none"
                    />
                    <span className={`text-sm flex-1 ${item.is_checked ? 'line-through text-muted-foreground' : ''}`}>
                      {item.label}
                    </span>
                    {item.checked_at && (
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(item.checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
