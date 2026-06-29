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
      <div className="mx-auto max-w-7xl space-y-6 rounded-3xl border border-amber-500/10 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.16),transparent_34%),linear-gradient(180deg,#09090b,#030303)] p-4 text-zinc-100 shadow-2xl shadow-black/30 md:p-6">
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
        <TemplateBuilder template={selectedTemplate} onBack={() => setSelectedTemplate(null)} />
      </div>
    );
  }

  // If viewing an instance
  if (selectedInstance) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 rounded-3xl border border-amber-500/10 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.14),transparent_34%),linear-gradient(180deg,#09090b,#030303)] p-4 text-zinc-100 shadow-2xl shadow-black/30 md:p-6">
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
        <ChecklistInstanceView instance={selectedInstance} onBack={() => setSelectedInstance(null)} />
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
        ? 'border-zinc-500/35 bg-zinc-500/10 text-zinc-300'
        : 'border-amber-300/40 bg-amber-400/10 text-amber-200';
    const progressClass = instance.status === 'completed'
      ? '[&>div]:from-emerald-500 [&>div]:via-teal-300 [&>div]:to-emerald-200'
      : '[&>div]:from-amber-500 [&>div]:via-yellow-300 [&>div]:to-amber-200';

    return (
      <Card
        key={instance.id}
        className="group relative cursor-pointer overflow-hidden rounded-2xl border border-amber-500/15 bg-[linear-gradient(145deg,rgba(24,24,27,0.98),rgba(9,9,11,0.98)_46%,rgba(0,0,0,0.98))] shadow-lg shadow-black/30 outline-none transition-all duration-300 hover:-translate-y-1 hover:border-amber-300/70 hover:shadow-[0_24px_58px_rgba(245,158,11,0.16)] focus-visible:-translate-y-1 focus-visible:border-amber-300/75 focus-visible:ring-2 focus-visible:ring-amber-300/45 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
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
              <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-amber-200">{instance.progress_percent}%</span>
            </div>
            <Progress value={instance.progress_percent} className={`h-2.5 bg-zinc-800/90 shadow-inner shadow-black/40 [&>div]:bg-gradient-to-r ${progressClass}`} />
            {instance.progress_percent === 0 && (
              <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">Ready to start</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 rounded-3xl border border-amber-500/10 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.16),transparent_34%),linear-gradient(180deg,#09090b,#030303)] p-4 text-zinc-100 shadow-2xl shadow-black/30 md:p-6">
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
        <div className="overflow-x-auto rounded-3xl border border-amber-500/15 bg-[linear-gradient(135deg,rgba(245,158,11,0.08),rgba(9,9,11,0.92)_32%,rgba(3,3,3,0.96))] p-2 shadow-[0_18px_45px_rgba(0,0,0,0.28)]">
          <TabsList className="inline-flex h-auto w-auto min-w-full gap-1 rounded-2xl border border-white/5 bg-black/70 p-1.5 md:grid md:w-full md:grid-cols-4">
            <TabsTrigger value="active" className="group flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold text-zinc-400 transition-all duration-200 hover:bg-white/5 hover:text-amber-100 focus-visible:ring-2 focus-visible:ring-amber-300/70 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-yellow-400 data-[state=active]:text-black data-[state=active]:shadow-[0_12px_30px_rgba(245,158,11,0.26)] md:text-sm">
              <ClipboardList className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-data-[state=active]:scale-110 md:h-4 md:w-4" />
              <span>Active</span>
              <span className="rounded-full border border-current/20 bg-black/20 px-2 py-0.5 text-[10px] font-bold tabular-nums group-data-[state=active]:bg-black/10 md:text-xs">{activeInstances.length}</span>
            </TabsTrigger>
            <TabsTrigger value="completed" className="group flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold text-zinc-400 transition-all duration-200 hover:bg-white/5 hover:text-amber-100 focus-visible:ring-2 focus-visible:ring-amber-300/70 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-yellow-400 data-[state=active]:text-black data-[state=active]:shadow-[0_12px_30px_rgba(245,158,11,0.26)] md:text-sm">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-data-[state=active]:scale-110 md:h-4 md:w-4" />
              <span>Completed</span>
              <span className="rounded-full border border-current/20 bg-black/20 px-2 py-0.5 text-[10px] font-bold tabular-nums group-data-[state=active]:bg-black/10 md:text-xs">{completedInstances.length}</span>
            </TabsTrigger>
            <TabsTrigger value="archived" className="group flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold text-zinc-400 transition-all duration-200 hover:bg-white/5 hover:text-amber-100 focus-visible:ring-2 focus-visible:ring-amber-300/70 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-yellow-400 data-[state=active]:text-black data-[state=active]:shadow-[0_12px_30px_rgba(245,158,11,0.26)] md:text-sm">
              <span className="shrink-0 text-sm leading-none transition-transform duration-200 group-data-[state=active]:scale-110">📦</span>
              <span>Archived</span>
              <span className="rounded-full border border-current/20 bg-black/20 px-2 py-0.5 text-[10px] font-bold tabular-nums group-data-[state=active]:bg-black/10 md:text-xs">{archivedInstances.length}</span>
            </TabsTrigger>
            <TabsTrigger value="templates" className="group flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold text-zinc-400 transition-all duration-200 hover:bg-white/5 hover:text-amber-100 focus-visible:ring-2 focus-visible:ring-amber-300/70 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-yellow-400 data-[state=active]:text-black data-[state=active]:shadow-[0_12px_30px_rgba(245,158,11,0.26)] md:text-sm">
              <LayoutTemplate className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-data-[state=active]:scale-110 md:h-4 md:w-4" />
              <span>Templates</span>
              <span className="rounded-full border border-current/20 bg-black/20 px-2 py-0.5 text-[10px] font-bold tabular-nums group-data-[state=active]:bg-black/10 md:text-xs">{templates.length}</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Active Checklists */}
        <TabsContent value="active" className="space-y-4 rounded-2xl border border-white/5 bg-zinc-950/55 p-4 shadow-xl shadow-black/20">
          {instancesLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : activeInstances.length === 0 ? (
            <Card className="border-dashed border-amber-500/20 bg-zinc-950/80">
              <CardContent className="py-12 text-center">
                <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold mb-1">No active checklists</h3>
                <p className="text-sm text-muted-foreground mb-4">Generate one from a template to get started</p>
                <Button variant="secondary" onClick={() => setActiveTab('templates')}>
                  <LayoutTemplate className="h-4 w-4 mr-2" /> View Templates
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {activeInstances.map(renderInstanceCard)}
            </div>
          )}
        </TabsContent>

        {/* Completed */}
        <TabsContent value="completed" className="space-y-4 rounded-2xl border border-emerald-400/10 bg-[linear-gradient(180deg,rgba(6,78,59,0.12),rgba(9,9,11,0.72))] p-4 shadow-xl shadow-black/20">
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
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {completedInstances.map(renderInstanceCard)}
            </div>
          )}
        </TabsContent>

        {/* Archived */}
        <TabsContent value="archived" className="space-y-4 rounded-2xl border border-white/5 bg-zinc-950/55 p-4 shadow-xl shadow-black/20">
          {archivedInstances.length === 0 ? (
            <Card className="border-dashed border-amber-500/20 bg-zinc-950/80">
              <CardContent className="py-12 text-center">
                <span className="text-5xl mb-4 block">📦</span>
                <h3 className="font-semibold mb-1">No archived checklists</h3>
                <p className="text-sm text-muted-foreground">Archived checklists are stored here for reference</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {archivedInstances.map(renderInstanceCard)}
            </div>
          )}
        </TabsContent>

        {/* Templates */}
        <TabsContent value="templates" className="space-y-4 rounded-2xl border border-white/5 bg-zinc-950/55 p-4 shadow-xl shadow-black/20">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-500/10 bg-black/30 p-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">Checklist Templates</h2>
              <p className="text-sm text-muted-foreground">Reusable blueprints for generating checklists</p>
            </div>
            <div className="flex items-center gap-2">
              {canEdit && (
                <Button variant="outline" size="sm" className="gap-1" onClick={() => setUploadDialogOpen(true)}>
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
                    <Button size="sm" className="gap-1">
                      <Plus className="h-3 w-3" /> New Template
                    </Button>
                  </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Template</DialogTitle>
                    <DialogDescription>Build a reusable checklist template from scratch</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <div className="w-20">
                        <Label className="text-xs text-muted-foreground">Icon</Label>
                        <Input value={newIcon} onChange={e => setNewIcon(e.target.value)} className="text-center text-xl" />
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground">Name</Label>
                        <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Daily Operations" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Description (optional)</Label>
                      <Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="What is this checklist for?" rows={2} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateTemplate} disabled={!newName.trim()}>Create Template</Button>
                  </DialogFooter>
                </DialogContent>
                </Dialog>
              )}
            </div>
          </div>

          {templatesLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading templates...
            </div>
          ) : templates.length === 0 ? (
            <Card className="border-dashed border-amber-500/20 bg-zinc-950/80">
              <CardContent className="py-12 text-center">
                <LayoutTemplate className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold mb-1">No templates yet</h3>
                <p className="text-sm text-muted-foreground mb-4">Create your first checklist template or import one</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map(template => (
                <Card
                  key={template.id}
                  className="group relative cursor-pointer border-amber-500/15 bg-gradient-to-br from-zinc-950 via-zinc-900 to-black shadow-lg shadow-black/30 transition-all hover:-translate-y-0.5 hover:border-amber-400/60 hover:shadow-amber-500/10"
                  onClick={() => setSelectedTemplate(template)}
                >
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{template.icon}</span>
                        <div>
                          <h3 className="text-sm font-semibold text-zinc-100">{template.name}</h3>
                          {template.description && (
                            <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{template.description}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-2">
                        {template.cron_enabled && (
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            {template.cron_description || 'Scheduled'}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => mutations.generateFromTemplate.mutate(template)}
                          title="Generate checklist"
                        >
                          <PlayCircle className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
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
