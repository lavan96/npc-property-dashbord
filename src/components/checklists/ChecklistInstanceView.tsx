import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ArrowLeft, CheckCircle2, Trash2, Archive, Loader2 } from 'lucide-react';
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
  const statusClass = instance.status === 'completed'
    ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200'
    : instance.status === 'archived'
      ? 'border-amber-700/35 bg-amber-950/30 text-amber-200'
      : 'border-amber-300/40 bg-amber-400/10 text-amber-200';
  const progressFillClass = instance.status === 'completed'
    ? '[&>div]:from-emerald-500 [&>div]:via-teal-300 [&>div]:to-emerald-200'
    : '[&>div]:from-amber-500 [&>div]:via-yellow-300 [&>div]:to-amber-200';
  const progressStateLabel = progress === 100 ? 'Complete' : progress === 0 ? 'Ready to start' : 'In progress';
  const progressStateClass = progress === 100
    ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200'
    : progress === 0
      ? 'border-zinc-600/45 bg-zinc-900/70 text-zinc-300'
      : 'border-amber-300/25 bg-amber-400/10 text-amber-200';

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
    <div className="min-h-0 space-y-6 rounded-3xl border border-amber-500/10 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.14),transparent_34%),linear-gradient(180deg,#09090b,#030303)] p-4 text-zinc-100 md:p-6">
      {/* Header */}
      <div className="rounded-2xl border border-amber-500/10 bg-black/35 p-4 shadow-inner shadow-amber-950/10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
            <Button variant="ghost" size="sm" onClick={onBack} className="min-h-10 w-fit gap-1 border border-white/5 bg-black/30 text-zinc-300 transition-all duration-200 hover:-translate-x-0.5 hover:border-amber-300/35 hover:bg-amber-400/10 hover:text-amber-100 hover:shadow-[0_10px_24px_rgba(245,158,11,0.12)] focus-visible:ring-2 focus-visible:ring-amber-300/55 motion-reduce:transition-none">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <div className="min-w-0">
              <h2 className="flex items-start gap-3 text-2xl font-bold tracking-tight text-zinc-50 md:text-3xl">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-300/20 bg-black/35 text-2xl shadow-inner shadow-amber-950/20">{instance.icon}</span>
                <span className="min-w-0 break-words leading-tight">{instance.name}</span>
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusClass}`}>
                  {instance.status === 'completed' ? <><CheckCircle2 className="h-3 w-3 mr-1" /> Completed</> : instance.status}
                </Badge>
                <span className="rounded-full border border-white/5 bg-black/30 px-2.5 py-1 text-xs font-medium text-zinc-400">
                  Created {new Date(instance.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center lg:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleArchive}
              className="min-h-10 justify-center gap-1 border-zinc-600/50 bg-black/30 text-zinc-300 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-300/45 hover:bg-amber-400/10 hover:text-amber-100 hover:shadow-[0_10px_24px_rgba(245,158,11,0.12)] focus-visible:ring-2 focus-visible:ring-amber-300/55 motion-reduce:transition-none"
              disabled={mutations.updateInstance.isPending}
            >
              <Archive className="h-3 w-3" /> Archive
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="min-h-10 justify-center gap-1 border-destructive/35 bg-destructive/5 text-destructive transition-all duration-200 hover:-translate-y-0.5 hover:border-destructive/70 hover:bg-destructive/10 hover:text-destructive hover:shadow-[0_10px_24px_rgba(239,68,68,0.12)] focus-visible:ring-2 focus-visible:ring-destructive/45 motion-reduce:transition-none">
                  <Trash2 className="h-3 w-3" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-3xl border-destructive/20 bg-[linear-gradient(180deg,rgba(24,24,27,0.98),rgba(3,3,3,0.98))] text-zinc-100 shadow-2xl shadow-black/40">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-zinc-50">Delete Checklist Instance</AlertDialogTitle>
                  <AlertDialogDescription className="text-zinc-400">
                    This will permanently delete this generated checklist instance and all its items. The parent template remains available in Templates.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
                  <AlertDialogCancel className="border-white/10 bg-black/40 text-zinc-200 hover:bg-white/5">Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete} disabled={mutations.deleteInstance.isPending}>Delete Instance</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      {/* Progress */}
      <Card className="overflow-hidden rounded-2xl border-amber-500/15 bg-[linear-gradient(145deg,rgba(24,24,27,0.98),rgba(9,9,11,0.98)_46%,rgba(0,0,0,0.98))] shadow-lg shadow-black/30">
        <CardContent className="p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Overall progress</p>
              <span className="mt-1 block text-base font-semibold text-zinc-100">{checkedCount} of {totalCount} completed</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${progressStateClass}`}>
                {progressStateLabel}
              </Badge>
              <span className="text-4xl font-bold tabular-nums text-amber-200 drop-shadow-[0_0_18px_rgba(245,158,11,0.24)]">{progress}%</span>
            </div>
          </div>
          <div className="rounded-full border border-white/5 bg-black/35 p-1 shadow-inner shadow-black/50">
            <Progress value={progress} className={`h-4 bg-zinc-800/90 shadow-inner shadow-black/40 [&>div]:bg-gradient-to-r [&>div]:shadow-[0_0_24px_rgba(245,158,11,0.28)] [&>div]:transition-all [&>div]:duration-500 ${progressFillClass}`} />
          </div>
        </CardContent>
      </Card>

      {/* Sections & Items */}
      {isLoading ? (
        <Card className="overflow-hidden rounded-2xl border border-amber-500/15 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.12),transparent_34%),linear-gradient(180deg,rgba(9,9,11,0.96),rgba(3,3,3,0.96))] shadow-inner shadow-amber-950/20">
          <CardContent className="py-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-300/25 bg-amber-400/10 text-amber-200 shadow-[0_18px_45px_rgba(245,158,11,0.14)]">
              <Loader2 className="h-7 w-7 animate-spin" />
            </div>
            <p className="text-sm font-semibold text-zinc-100">Loading checklist items...</p>
            <p className="mt-1 text-xs text-zinc-500">Syncing sections, tasks and progress</p>
          </CardContent>
        </Card>
      ) : sections.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">This checklist has no items.</p>
      ) : (
        <div className="min-h-0 space-y-4 overflow-x-hidden">
          {sections.map((section, idx) => {
          const sectionChecked = section.items.filter(i => i.is_checked).length;
          const sectionTotal = section.items.length;
          const sectionComplete = sectionTotal > 0 && sectionChecked === sectionTotal;
          const sectionStarted = sectionChecked > 0 && !sectionComplete;
          const sectionBadgeClass = sectionComplete
            ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200'
            : sectionStarted
              ? 'border-amber-300/25 bg-amber-400/10 text-amber-200'
              : 'border-zinc-600/45 bg-zinc-900/70 text-zinc-300';
          const sectionCardClass = sectionComplete
            ? 'border-emerald-400/15 bg-[linear-gradient(145deg,rgba(6,78,59,0.16),rgba(9,9,11,0.96)_42%,rgba(0,0,0,0.98))] hover:border-emerald-300/35'
            : sectionStarted
              ? 'border-amber-400/20 bg-[linear-gradient(145deg,rgba(120,53,15,0.18),rgba(9,9,11,0.96)_42%,rgba(0,0,0,0.98))] hover:border-amber-300/45'
              : 'border-zinc-700/45 bg-[linear-gradient(145deg,rgba(39,39,42,0.5),rgba(9,9,11,0.96)_42%,rgba(0,0,0,0.98))] hover:border-zinc-500/60';
          const sectionIconClass = sectionComplete
            ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100'
            : sectionStarted
              ? 'border-amber-300/20 bg-amber-400/10 text-amber-100'
              : 'border-zinc-600/40 bg-black/30 text-zinc-300';

          return (
            <Card key={idx} className={`group overflow-hidden rounded-2xl border shadow-lg shadow-black/30 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(0,0,0,0.36)] motion-reduce:transition-none ${sectionCardClass}`}>
              <CardHeader className="p-5 pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="flex min-w-0 items-center gap-3 text-base text-zinc-100">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-inner shadow-black/20 ${sectionIconClass}`}>{section.icon}</span>
                    <span className="min-w-0 break-words leading-snug">{section.title}</span>
                  </CardTitle>
                  <Badge variant="secondary" className={`gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${sectionBadgeClass}`}>
                    {sectionComplete && <CheckCircle2 className="h-3 w-3" />}
                    {sectionChecked}/{sectionTotal}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-1.5 px-5 pb-5">
                {section.items.map(item => (
                  <div
                    key={item.id}
                    className={`group/task flex min-h-12 min-w-0 cursor-pointer flex-wrap items-start gap-3 sm:flex-nowrap rounded-xl border px-3 py-3 leading-relaxed outline-none transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-300/30 hover:bg-amber-500/10 hover:shadow-[0_10px_24px_rgba(245,158,11,0.08)] motion-reduce:transition-none focus-visible:border-amber-300/45 focus-visible:bg-amber-500/10 focus-visible:ring-2 focus-visible:ring-amber-300/35 focus-visible:ring-offset-2 focus-visible:ring-offset-black ${item.is_checked ? 'border-emerald-300/15 bg-emerald-400/10' : 'border-white/5 bg-black/20'}`}
                    onClick={() => handleToggleItem(item.id, item.is_checked)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleToggleItem(item.id, item.is_checked);
                      }
                    }}
                    role="checkbox"
                    aria-checked={item.is_checked}
                    tabIndex={0}
                  >
                    <Checkbox
                      checked={item.is_checked}
                      onCheckedChange={() => handleToggleItem(item.id, item.is_checked)}
                      className="pointer-events-none mt-0.5 h-5 w-5 rounded-full border-amber-300/55 bg-black/40 shadow-inner shadow-black/30 transition-all duration-200 data-[state=checked]:border-emerald-300 data-[state=checked]:bg-emerald-400 data-[state=checked]:text-black group-hover/task:border-amber-200"
                    />
                    <span className={`min-w-0 flex-1 basis-[calc(100%-2rem)] whitespace-normal break-words sm:basis-auto text-sm leading-6 ${item.is_checked ? 'text-zinc-300 line-through decoration-emerald-300/70 decoration-2 underline-offset-4' : 'text-zinc-100'}`}>
                      {item.label}
                    </span>
                    {item.checked_at && (
                      <span className="ml-8 rounded-full border border-emerald-300/15 sm:ml-0 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-200">
                        {new Date(item.checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
        </div>
      )}
    </div>
  );
}
