import { useState } from 'react';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { ClipboardList, LayoutTemplate, Plus, PlayCircle, Trash2, Clock, CheckCircle2, Loader2, Pencil, Upload } from 'lucide-react';
import { useChecklistTemplates, useChecklistInstances, useChecklistMutations, type ChecklistTemplate, type ChecklistInstance } from '@/hooks/useChecklists';
import { TemplateBuilder } from '@/components/checklists/TemplateBuilder';
import { ChecklistInstanceView } from '@/components/checklists/ChecklistInstanceView';
import { TemplateImportDialog } from '@/components/checklists/TemplateImportDialog';
import type { ParsedTemplate } from '@/utils/checklistTemplateParser';
import { toast } from 'sonner';


const ChecklistLoadingState = ({ message }: { message: string }) => (
  <Card className="overflow-hidden border border-amber-500/15 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.12),transparent_34%),linear-gradient(180deg,rgba(9,9,11,0.96),rgba(3,3,3,0.96))] shadow-inner shadow-amber-950/20">
    <CardContent className="py-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-300/25 bg-amber-400/10 text-amber-200 shadow-[0_18px_45px_rgba(245,158,11,0.14)]">
        <Loader2 className="h-7 w-7 animate-spin" />
      </div>
      <p className="text-sm font-semibold text-zinc-100">{message}</p>
      <p className="mt-1 text-xs text-zinc-500">Preparing the workflow workspace</p>
    </CardContent>
  </Card>
);

export default function Checklists() {
  const { canEdit, canDelete } = useModulePermissions('checklists');
  const [activeTab, setActiveTab] = useState('active');
  const [selectedTemplate, setSelectedTemplate] = useState<ChecklistTemplate | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<ChecklistInstance | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newIcon, setNewIcon] = useState('📋');
  

  const { data: templates = [], isLoading: templatesLoading } = useChecklistTemplates();
  const { data: activeInstances = [], isLoading: instancesLoading } = useChecklistInstances('in_progress');
  const { data: completedInstances = [] } = useChecklistInstances('completed');
  const { data: archivedInstances = [] } = useChecklistInstances('archived');
  const mutations = useChecklistMutations();

  // If viewing a template builder
  if (selectedTemplate) {
    return (
      <div className="mx-auto flex max-h-[calc(100vh-2rem)] min-h-0 max-w-7xl flex-col space-y-6 overflow-hidden rounded-3xl border border-amber-500/10 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.16),transparent_34%),linear-gradient(180deg,#09090b,#030303)] p-4 text-zinc-100 shadow-2xl shadow-black/30 md:p-6">
        <div className="rounded-2xl border border-white/5 bg-black/30 p-5 shadow-inner shadow-amber-950/10">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/30 bg-gradient-to-br from-amber-300/20 via-zinc-950 to-black text-amber-200">
              <ClipboardList className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-zinc-50">Checklists</h1>
              <p className="text-zinc-400">Manage checklist templates and track operational workflows</p>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1 overscroll-contain [scrollbar-color:rgba(245,158,11,0.35)_rgba(24,24,27,0.72)]">
          <TemplateBuilder template={selectedTemplate} onBack={() => setSelectedTemplate(null)} />
        </div>
      </div>
    );
  }

  // If viewing an instance
  if (selectedInstance) {
    return (
      <div className="mx-auto flex max-h-[calc(100vh-2rem)] min-h-0 max-w-7xl flex-col space-y-6 overflow-hidden rounded-3xl border border-amber-500/10 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.14),transparent_34%),linear-gradient(180deg,#09090b,#030303)] p-4 text-zinc-100 shadow-2xl shadow-black/30 md:p-6">
        <div className="rounded-2xl border border-white/5 bg-black/30 p-5 shadow-inner shadow-amber-950/10">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/30 bg-gradient-to-br from-amber-300/20 via-zinc-950 to-black text-amber-200">
              <ClipboardList className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-zinc-50">Checklists</h1>
              <p className="text-zinc-400">Manage checklist templates and track operational workflows</p>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1 overscroll-contain [scrollbar-color:rgba(245,158,11,0.35)_rgba(24,24,27,0.72)]">
          <ChecklistInstanceView instance={selectedInstance} onBack={() => setSelectedInstance(null)} />
        </div>
      </div>
    );
  }

  const handleCreateTemplate = () => {
    if (!newName.trim()) return;
    mutations.createTemplate.mutate(
      { name: newName.trim(), description: newDesc.trim() || null, icon: newIcon },
      { onSuccess: () => { setCreateDialogOpen(false); setNewName(''); setNewDesc(''); setNewIcon('📋'); } }
    );
  };

  const handleImportTemplate = async (parsed: ParsedTemplate) => {
    // Create template
    const result = await mutations.createTemplate.mutateAsync({
      name: parsed.name,
      description: parsed.description || null,
      icon: parsed.icon || '📋',
    });

    const templateId = result?.record?.id;
    if (!templateId) throw new Error('Failed to create template');

    // Create sections and items
    for (let si = 0; si < parsed.sections.length; si++) {
      const sec = parsed.sections[si];
      const sectionResult = await mutations.createSection.mutateAsync({
        template_id: templateId,
        title: sec.title,
        icon: sec.icon || '▶️',
        display_order: si,
      });
      const sectionId = sectionResult?.record?.id;
      if (sectionId && sec.items) {
        for (let ii = 0; ii < sec.items.length; ii++) {
          const item = sec.items[ii];
          await mutations.createItem.mutateAsync({
            section_id: sectionId,
            label: item.label,
            is_pre_checked: item.is_pre_checked || false,
            display_order: ii,
          });
        }
      }
    }
  };

  const renderInstanceCard = (instance: ChecklistInstance) => {
    const statusClass = instance.status === 'completed'
      ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200'
      : instance.status === 'archived'
        ? 'border-amber-700/35 bg-amber-950/30 text-amber-200'
        : 'border-amber-300/40 bg-amber-400/10 text-amber-200';
    const progressClass = instance.status === 'completed'
      ? '[&>div]:from-emerald-500 [&>div]:via-teal-300 [&>div]:to-emerald-200'
      : '[&>div]:from-amber-500 [&>div]:via-yellow-300 [&>div]:to-amber-200';
    const progressPercentClass = instance.status === 'completed'
      ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200'
      : instance.status === 'archived'
        ? 'border-amber-700/35 bg-amber-950/30 text-amber-200'
        : 'border-amber-300/20 bg-amber-300/10 text-amber-200';

    return (
      <Card
        key={instance.id}
        className="group relative cursor-pointer overflow-hidden rounded-2xl border border-amber-500/15 bg-[linear-gradient(145deg,rgba(24,24,27,0.98),rgba(9,9,11,0.98)_46%,rgba(0,0,0,0.98))] shadow-lg shadow-black/30 outline-none transition-all duration-300 hover:-translate-y-1 hover:border-amber-300/70 hover:shadow-[0_24px_58px_rgba(245,158,11,0.16)] focus-visible:-translate-y-1 focus-visible:border-amber-300/75 focus-visible:ring-2 focus-visible:ring-amber-300/45 focus-visible:ring-offset-2 focus-visible:ring-offset-black motion-reduce:transition-none"
        onClick={() => setSelectedInstance(instance)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setSelectedInstance(instance);
          }
        }}
        role="button"
        tabIndex={0}
      >
        <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/60 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-amber-400/10 blur-3xl opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100" />
        <CardContent className="relative p-5">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-300/20 bg-black/35 text-xl shadow-inner shadow-amber-950/20">{instance.icon}</span>
              <div className="min-w-0">
                <h3 className="line-clamp-2 break-words text-base font-semibold leading-snug text-zinc-50 transition-colors group-hover:text-amber-50">{instance.name}</h3>
                <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">
                  <Clock className="h-3 w-3 text-amber-300/75" />
                  {new Date(instance.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            <Badge variant="outline" className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] shadow-sm ${statusClass}`}>
              {instance.status === 'completed' && <CheckCircle2 className="mr-1 h-3 w-3" />}
              {instance.status}
            </Badge>
          </div>
          <div className="rounded-xl border border-white/5 bg-black/35 p-3.5 shadow-inner shadow-black/35">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Progress</span>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold tabular-nums ${progressPercentClass}`}>{instance.progress_percent}%</span>
            </div>
            <Progress value={instance.progress_percent} className={`h-2.5 bg-zinc-800/90 shadow-inner shadow-black/40 [&>div]:bg-gradient-to-r [&>div]:transition-all [&>div]:duration-500 [&>div]:shadow-[0_0_18px_rgba(245,158,11,0.18)] ${progressClass}`} />
            {instance.progress_percent === 0 && (
              <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">Ready to start</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="mx-auto flex max-h-[calc(100vh-2rem)] min-h-0 max-w-7xl flex-col space-y-6 overflow-hidden rounded-3xl border border-amber-500/10 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.16),transparent_34%),linear-gradient(180deg,#09090b,#030303)] p-4 text-zinc-100 shadow-2xl shadow-black/30 md:p-6">
      <div className="rounded-2xl border border-white/5 bg-black/35 p-5 shadow-inner shadow-amber-950/10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-300/30 bg-gradient-to-br from-amber-300/20 via-zinc-950 to-black text-amber-200 shadow-[0_18px_42px_rgba(245,158,11,0.16)]">
              <ClipboardList className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-zinc-50 md:text-4xl">Checklists</h1>
              <p className="mt-1 text-sm leading-6 text-zinc-400 md:text-base">Manage checklist templates and track operational workflows</p>
            </div>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="min-h-0 flex-1 space-y-5">
        <div className="overflow-x-auto overscroll-x-contain rounded-3xl [scrollbar-color:rgba(245,158,11,0.35)_rgba(24,24,27,0.72)] border border-amber-500/15 bg-[linear-gradient(135deg,rgba(245,158,11,0.08),rgba(9,9,11,0.92)_32%,rgba(3,3,3,0.96))] p-2 shadow-[0_18px_45px_rgba(0,0,0,0.28)]">
          <TabsList className="inline-flex h-auto w-auto min-w-full gap-1 rounded-2xl border border-white/5 bg-black/70 p-1.5 md:grid md:w-full md:grid-cols-4">
            <TabsTrigger value="active" className="group flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold text-zinc-400 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/5 hover:text-amber-100 hover:shadow-[0_10px_26px_rgba(245,158,11,0.12)] focus-visible:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-amber-300/70 motion-reduce:transition-none data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-yellow-400 data-[state=active]:text-black data-[state=active]:shadow-[0_12px_30px_rgba(245,158,11,0.26)] md:text-sm">
              <ClipboardList className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-data-[state=active]:scale-110 md:h-4 md:w-4" />
              <span>Active</span>
              <span className="rounded-full border border-current/20 bg-black/20 px-2 py-0.5 text-[10px] font-bold tabular-nums group-data-[state=active]:bg-black/10 md:text-xs">{activeInstances.length}</span>
            </TabsTrigger>
            <TabsTrigger value="completed" className="group flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold text-zinc-400 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/5 hover:text-amber-100 hover:shadow-[0_10px_26px_rgba(245,158,11,0.12)] focus-visible:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-amber-300/70 motion-reduce:transition-none data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-yellow-400 data-[state=active]:text-black data-[state=active]:shadow-[0_12px_30px_rgba(245,158,11,0.26)] md:text-sm">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-data-[state=active]:scale-110 md:h-4 md:w-4" />
              <span>Completed</span>
              <span className="rounded-full border border-current/20 bg-black/20 px-2 py-0.5 text-[10px] font-bold tabular-nums group-data-[state=active]:bg-black/10 md:text-xs">{completedInstances.length}</span>
            </TabsTrigger>
            <TabsTrigger value="archived" className="group flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold text-zinc-400 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/5 hover:text-amber-100 hover:shadow-[0_10px_26px_rgba(245,158,11,0.12)] focus-visible:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-amber-300/70 motion-reduce:transition-none data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-yellow-400 data-[state=active]:text-black data-[state=active]:shadow-[0_12px_30px_rgba(245,158,11,0.26)] md:text-sm">
              <span className="shrink-0 text-sm leading-none transition-transform duration-200 group-data-[state=active]:scale-110">📦</span>
              <span>Archived</span>
              <span className="rounded-full border border-current/20 bg-black/20 px-2 py-0.5 text-[10px] font-bold tabular-nums group-data-[state=active]:bg-black/10 md:text-xs">{archivedInstances.length}</span>
            </TabsTrigger>
            <TabsTrigger value="templates" className="group flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold text-zinc-400 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/5 hover:text-amber-100 hover:shadow-[0_10px_26px_rgba(245,158,11,0.12)] focus-visible:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-amber-300/70 motion-reduce:transition-none data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-yellow-400 data-[state=active]:text-black data-[state=active]:shadow-[0_12px_30px_rgba(245,158,11,0.26)] md:text-sm">
              <LayoutTemplate className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-data-[state=active]:scale-110 md:h-4 md:w-4" />
              <span>Templates</span>
              <span className="rounded-full border border-current/20 bg-black/20 px-2 py-0.5 text-[10px] font-bold tabular-nums group-data-[state=active]:bg-black/10 md:text-xs">{templates.length}</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Active Checklists */}
        <TabsContent value="active" className="space-y-4 rounded-2xl border border-white/5 bg-zinc-950/55 p-4 shadow-xl shadow-black/20 max-h-[calc(100vh-17rem)] overflow-y-auto overscroll-contain pr-2 [scrollbar-color:rgba(245,158,11,0.35)_rgba(24,24,27,0.72)]">
          {instancesLoading ? (
            <ChecklistLoadingState message="Loading..." />
          ) : activeInstances.length === 0 ? (
            <Card className="overflow-hidden border-dashed border-amber-500/25 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.14),transparent_34%),linear-gradient(180deg,rgba(9,9,11,0.96),rgba(3,3,3,0.96))] shadow-inner shadow-amber-950/20">
              <CardContent className="relative py-14 text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-300/25 bg-amber-400/10 text-amber-200 shadow-[0_18px_45px_rgba(245,158,11,0.16)]">
                  <ClipboardList className="h-8 w-8" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-zinc-50">No active checklists</h3>
                <p className="mb-5 text-sm text-zinc-400">Generate one from a template to get started</p>
                <Button variant="secondary" className="border border-amber-300/20 bg-amber-400/10 text-amber-100 transition-all duration-200 hover:-translate-y-0.5 hover:bg-amber-400/20 hover:text-amber-50 hover:shadow-[0_12px_28px_rgba(245,158,11,0.14)] focus-visible:ring-2 focus-visible:ring-amber-300/60 motion-reduce:transition-none" onClick={() => setActiveTab('templates')}>
                  <LayoutTemplate className="h-4 w-4 mr-2" /> View Templates
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {activeInstances.map(renderInstanceCard)}
            </div>
          )}
        </TabsContent>

        {/* Completed */}
        <TabsContent value="completed" className="space-y-4 rounded-2xl border border-emerald-400/10 bg-[linear-gradient(180deg,rgba(6,78,59,0.12),rgba(9,9,11,0.72))] p-4 shadow-xl shadow-black/20 max-h-[calc(100vh-17rem)] overflow-y-auto overscroll-contain pr-2 [scrollbar-color:rgba(245,158,11,0.35)_rgba(24,24,27,0.72)]">
          {completedInstances.length === 0 ? (
            <Card className="overflow-hidden border-dashed border-emerald-400/25 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_34%),linear-gradient(180deg,rgba(9,9,11,0.96),rgba(3,7,18,0.96))] shadow-inner shadow-emerald-950/20">
              <CardContent className="relative py-14 text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-300/25 bg-emerald-400/10 text-emerald-200 shadow-[0_18px_45px_rgba(16,185,129,0.16)]">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-zinc-50">No completed checklists yet</h3>
                <p className="text-sm text-zinc-400">Completed checklists will appear here</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {completedInstances.map(renderInstanceCard)}
            </div>
          )}
        </TabsContent>

        {/* Archived */}
        <TabsContent value="archived" className="space-y-4 rounded-2xl border border-amber-700/15 bg-[linear-gradient(180deg,rgba(120,53,15,0.12),rgba(9,9,11,0.72))] p-4 shadow-xl shadow-black/20 max-h-[calc(100vh-17rem)] overflow-y-auto overscroll-contain pr-2 [scrollbar-color:rgba(245,158,11,0.35)_rgba(24,24,27,0.72)]">
          {archivedInstances.length === 0 ? (
            <Card className="overflow-hidden border-dashed border-amber-700/30 bg-[radial-gradient(circle_at_top,rgba(180,83,9,0.13),transparent_34%),linear-gradient(180deg,rgba(9,9,11,0.96),rgba(12,10,9,0.96))] shadow-inner shadow-amber-950/20">
              <CardContent className="relative py-14 text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-600/25 bg-amber-900/20 text-4xl shadow-[0_18px_45px_rgba(120,53,15,0.18)]">
                  <span aria-hidden="true">📦</span>
                </div>
                <h3 className="mb-2 text-lg font-semibold text-zinc-50">No archived checklists</h3>
                <p className="text-sm text-zinc-400">Archived checklists are stored here for reference</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {archivedInstances.map(renderInstanceCard)}
            </div>
          )}
        </TabsContent>

        {/* Templates */}
        <TabsContent value="templates" className="space-y-5 rounded-2xl border border-amber-500/10 bg-[linear-gradient(180deg,rgba(245,158,11,0.08),rgba(9,9,11,0.72))] p-4 shadow-xl shadow-black/20 max-h-[calc(100vh-17rem)] overflow-y-auto overscroll-contain pr-2 [scrollbar-color:rgba(245,158,11,0.35)_rgba(24,24,27,0.72)]">
          <div className="flex flex-col gap-4 rounded-2xl border border-amber-500/15 bg-[linear-gradient(135deg,rgba(245,158,11,0.1),rgba(0,0,0,0.42)_42%,rgba(0,0,0,0.72))] p-4 shadow-inner shadow-amber-950/10 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-zinc-50">Checklist Templates</h2>
              <p className="mt-1 text-sm leading-6 text-zinc-400">Reusable blueprints for generating checklists</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && (
                <Button variant="outline" size="sm" className="gap-1 border-amber-300/25 bg-black/35 text-amber-100 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-300/55 hover:bg-amber-400/10 hover:text-amber-50 hover:shadow-[0_12px_28px_rgba(245,158,11,0.14)] focus-visible:ring-2 focus-visible:ring-amber-300/60 motion-reduce:transition-none" onClick={() => setUploadDialogOpen(true)}>
                  <Upload className="h-3 w-3" /> Import
                </Button>
              )}
              <TemplateImportDialog
                open={uploadDialogOpen}
                onOpenChange={setUploadDialogOpen}
                onImport={handleImportTemplate}
              />

              {canEdit && (
                <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1 bg-gradient-to-r from-amber-500 to-yellow-400 font-semibold text-black shadow-[0_12px_28px_rgba(245,158,11,0.24)] transition-all duration-200 hover:-translate-y-0.5 hover:from-amber-400 hover:to-yellow-300 hover:shadow-[0_16px_34px_rgba(245,158,11,0.3)] focus-visible:ring-2 focus-visible:ring-amber-300/70 motion-reduce:transition-none">
                      <Plus className="h-3 w-3" /> New Template
                    </Button>
                  </DialogTrigger>
                <DialogContent className="max-h-[min(85vh,720px)] w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain [scrollbar-color:rgba(245,158,11,0.35)_rgba(24,24,27,0.72)] border-amber-500/15 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.14),transparent_34%),linear-gradient(180deg,#09090b,#030303)] text-zinc-100 shadow-2xl shadow-black/40">
                  <DialogHeader className="rounded-2xl border border-amber-500/10 bg-black/35 p-4 shadow-inner shadow-amber-950/10">
                    <DialogTitle className="text-2xl font-bold tracking-tight text-zinc-50">Create New Template</DialogTitle>
                    <DialogDescription className="text-zinc-400">Build a reusable checklist template from scratch</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 rounded-2xl border border-white/5 bg-zinc-950/70 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <div className="w-20">
                        <Label className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">Icon</Label>
                        <Input value={newIcon} onChange={e => setNewIcon(e.target.value)} className="mt-1 border-amber-500/15 bg-black/35 text-center text-xl text-zinc-100 focus-visible:ring-amber-300/45" />
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">Name</Label>
                        <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Daily Operations" className="mt-1 border-amber-500/15 bg-black/35 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-amber-300/45" />
                        <p className="mt-1.5 text-[11px] text-zinc-500">Give this blueprint a clear operational name.</p>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">Description (optional)</Label>
                      <Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="What is this checklist for?" rows={2} className="mt-1 border-amber-500/15 bg-black/35 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-amber-300/45" />
                      <p className="mt-1.5 text-[11px] text-zinc-500">Use this to clarify when the template should be generated or followed.</p>
                    </div>
                  </div>
                  <DialogFooter className="gap-2">
                    <Button variant="ghost" className="text-zinc-300 transition-all duration-200 hover:bg-white/5 hover:text-zinc-50 focus-visible:ring-2 focus-visible:ring-amber-300/55 motion-reduce:transition-none" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
                    <Button className="bg-gradient-to-r from-amber-500 to-yellow-400 font-semibold text-black shadow-[0_12px_28px_rgba(245,158,11,0.24)] transition-all duration-200 hover:-translate-y-0.5 hover:from-amber-400 hover:to-yellow-300 hover:shadow-[0_16px_34px_rgba(245,158,11,0.3)] focus-visible:ring-2 focus-visible:ring-amber-300/70 motion-reduce:transition-none" onClick={handleCreateTemplate} disabled={!newName.trim()}>Create Template</Button>
                  </DialogFooter>
                </DialogContent>
                </Dialog>
              )}
            </div>
          </div>

          {templatesLoading ? (
            <ChecklistLoadingState message="Loading templates..." />
          ) : templates.length === 0 ? (
            <Card className="overflow-hidden border-dashed border-amber-500/25 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.12),transparent_34%),linear-gradient(180deg,rgba(9,9,11,0.96),rgba(3,3,3,0.96))] shadow-inner shadow-amber-950/20">
              <CardContent className="relative py-14 text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-300/25 bg-amber-400/10 text-amber-200 shadow-[0_18px_45px_rgba(245,158,11,0.14)]">
                  <LayoutTemplate className="h-8 w-8" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-zinc-50">No templates yet</h3>
                <p className="text-sm text-zinc-400">Create your first checklist template or import one</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {templates.map(template => (
                <Card
                  key={template.id}
                  className="group relative cursor-pointer overflow-hidden rounded-2xl border border-amber-500/15 bg-[linear-gradient(145deg,rgba(24,24,27,0.98),rgba(9,9,11,0.98)_46%,rgba(0,0,0,0.98))] shadow-lg shadow-black/30 transition-all duration-300 hover:-translate-y-1 hover:border-amber-300/70 hover:shadow-[0_24px_58px_rgba(245,158,11,0.16)] focus-visible:-translate-y-1 focus-visible:border-amber-300/75 focus-visible:ring-2 focus-visible:ring-amber-300/45 focus-visible:ring-offset-2 focus-visible:ring-offset-black motion-reduce:transition-none"
                  onClick={() => setSelectedTemplate(template)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedTemplate(template);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/60 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-amber-400/10 blur-3xl opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <CardContent className="relative p-5">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3.5">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-300/20 bg-black/35 text-2xl shadow-inner shadow-amber-950/20">{template.icon}</span>
                        <div className="min-w-0">
                          <div className="mb-1.5 flex flex-wrap items-center gap-2">
                            <h3 className="line-clamp-2 break-words text-base font-semibold leading-snug text-zinc-50 transition-colors group-hover:text-amber-50">{template.name}</h3>
                            <Badge variant="outline" className="rounded-full border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-200">
                              Template
                            </Badge>
                          </div>
                          {template.description && (
                            <p className="line-clamp-2 text-xs leading-5 text-zinc-400">{template.description}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/30 p-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        {template.cron_enabled && (
                          <Badge variant="secondary" className="gap-1 rounded-full border border-amber-300/20 bg-amber-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-200">
                            <Clock className="h-2.5 w-2.5" />
                            Scheduled
                          </Badge>
                        )}
                        {template.cron_enabled && template.cron_description && (
                          <Badge variant="outline" className="rounded-full border-zinc-600/45 bg-zinc-900/70 px-2 py-1 text-[10px] font-medium text-zinc-300">
                            {template.cron_description}
                          </Badge>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1 rounded-full border border-white/5 bg-black/35 p-1 opacity-80 transition-opacity group-hover:opacity-100" onClick={e => e.stopPropagation()}>
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7 text-amber-100 hover:bg-amber-400/10 hover:text-amber-50"
                          onClick={() => mutations.generateFromTemplate.mutate(template)}
                          title="Generate checklist"
                        >
                          <PlayCircle className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive/80 transition-colors hover:bg-destructive/10 hover:text-destructive">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Template</AlertDialogTitle>
                              <AlertDialogDescription>Delete "{template.name}"? Existing generated checklists won't be affected.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => mutations.deleteTemplate.mutate(template.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
