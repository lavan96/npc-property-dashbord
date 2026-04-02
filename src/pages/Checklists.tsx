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
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Checklists</h1>
          <p className="text-muted-foreground">Manage checklist templates and track operational workflows</p>
        </div>
        <TemplateBuilder template={selectedTemplate} onBack={() => setSelectedTemplate(null)} />
      </div>
    );
  }

  // If viewing an instance
  if (selectedInstance) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Checklists</h1>
          <p className="text-muted-foreground">Manage checklist templates and track operational workflows</p>
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

  const renderInstanceCard = (instance: ChecklistInstance) => (
    <Card
      key={instance.id}
      className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all group"
      onClick={() => setSelectedInstance(instance)}
    >
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">{instance.icon}</span>
            <div>
              <h3 className="font-semibold text-sm leading-tight">{instance.name}</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {new Date(instance.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <Badge variant={instance.status === 'completed' ? 'default' : 'outline'} className="text-[10px]">
            {instance.status === 'completed' && <CheckCircle2 className="h-3 w-3 mr-1" />}
            {instance.status}
          </Badge>
        </div>
        <Progress value={instance.progress_percent} className="h-2" />
        <p className="text-[11px] text-muted-foreground mt-1.5 text-right">{instance.progress_percent}%</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Checklists</h1>
          <p className="text-muted-foreground">Manage checklist templates and track operational workflows</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="inline-flex w-auto min-w-full md:grid md:w-full md:grid-cols-4">
            <TabsTrigger value="active" className="flex items-center gap-1.5 text-xs md:text-sm whitespace-nowrap">
              <ClipboardList className="h-3.5 w-3.5 md:h-4 md:w-4" />
              Active ({activeInstances.length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="flex items-center gap-1.5 text-xs md:text-sm whitespace-nowrap">
              <CheckCircle2 className="h-3.5 w-3.5 md:h-4 md:w-4" />
              Completed ({completedInstances.length})
            </TabsTrigger>
            <TabsTrigger value="archived" className="flex items-center gap-1.5 text-xs md:text-sm whitespace-nowrap">
              📦 Archived ({archivedInstances.length})
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center gap-1.5 text-xs md:text-sm whitespace-nowrap">
              <LayoutTemplate className="h-3.5 w-3.5 md:h-4 md:w-4" />
              Templates ({templates.length})
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Active Checklists */}
        <TabsContent value="active" className="space-y-4">
          {instancesLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : activeInstances.length === 0 ? (
            <Card className="border-dashed">
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeInstances.map(renderInstanceCard)}
            </div>
          )}
        </TabsContent>

        {/* Completed */}
        <TabsContent value="completed" className="space-y-4">
          {completedInstances.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold mb-1">No completed checklists yet</h3>
                <p className="text-sm text-muted-foreground">Completed checklists will appear here</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {completedInstances.map(renderInstanceCard)}
            </div>
          )}
        </TabsContent>

        {/* Archived */}
        <TabsContent value="archived" className="space-y-4">
          {archivedInstances.length === 0 ? (
            <Card className="border-dashed">
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
        <TabsContent value="templates" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Checklist Templates</h2>
              <p className="text-sm text-muted-foreground">Reusable blueprints for generating checklists</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1" onClick={() => setUploadDialogOpen(true)}>
                <Upload className="h-3 w-3" /> Import
              </Button>
              <TemplateImportDialog
                open={uploadDialogOpen}
                onOpenChange={setUploadDialogOpen}
                onImport={handleImportTemplate}
              />

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
            </div>
          </div>

          {templatesLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading templates...
            </div>
          ) : templates.length === 0 ? (
            <Card className="border-dashed">
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
                  className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all group relative"
                  onClick={() => setSelectedTemplate(template)}
                >
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{template.icon}</span>
                        <div>
                          <h3 className="font-semibold text-sm">{template.name}</h3>
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
