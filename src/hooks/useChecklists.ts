import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { toast } from 'sonner';
import { logActivityDirect } from '@/hooks/useActivityLogger';

// ─── Types ───
export interface ChecklistTemplate {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  created_by: string | null;
  is_active: boolean;
  cron_enabled: boolean;
  cron_expression: string | null;
  cron_description: string | null;
  last_generated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChecklistSection {
  id: string;
  template_id: string;
  title: string;
  icon: string;
  display_order: number;
  created_at: string;
  items?: ChecklistItem[];
}

export interface ChecklistItem {
  id: string;
  section_id: string;
  label: string;
  is_pre_checked: boolean;
  display_order: number;
}

export interface ChecklistInstance {
  id: string;
  template_id: string | null;
  name: string;
  description: string | null;
  icon: string;
  generated_by: string | null;
  status: 'in_progress' | 'completed' | 'archived';
  completed_at: string | null;
  progress_percent: number;
  created_at: string;
  updated_at: string;
}

export interface ChecklistInstanceItem {
  id: string;
  instance_id: string;
  section_title: string;
  section_icon: string;
  section_order: number;
  label: string;
  is_checked: boolean;
  checked_at: string | null;
  checked_by: string | null;
  display_order: number;
}

// ─── Helpers ───
async function invoke(body: Record<string, any>) {
  const { data, error } = await invokeSecureFunction('manage-templates', body);
  if (error) throw new Error(error.message);
  return data;
}

// ─── Templates ───
export function useChecklistTemplates() {
  return useQuery({
    queryKey: ['checklist-templates'],
    queryFn: async () => {
      const data = await invoke({ operation: 'list', table: 'checklist_templates', listOptions: { orderBy: 'created_at', orderAsc: false } });
      return (data?.records || []) as ChecklistTemplate[];
    },
  });
}

export function useChecklistTemplateSections(templateId: string | null) {
  return useQuery({
    queryKey: ['checklist-template-sections', templateId],
    queryFn: async () => {
      const data = await invoke({ operation: 'list', table: 'checklist_template_sections', listOptions: { filters: { template_id: templateId }, orderBy: 'display_order', orderAsc: true } });
      return (data?.records || []) as ChecklistSection[];
    },
    enabled: !!templateId,
  });
}

export function useChecklistTemplateItems(sectionIds: string[]) {
  return useQuery({
    queryKey: ['checklist-template-items', sectionIds],
    queryFn: async () => {
      if (!sectionIds.length) return [];
      // Fetch all items and filter client-side (edge function only supports eq filters)
      const data = await invoke({ operation: 'list', table: 'checklist_template_items', listOptions: { orderBy: 'display_order', orderAsc: true, limit: 500 } });
      const allItems = (data?.records || []) as ChecklistItem[];
      return allItems.filter(i => sectionIds.includes(i.section_id));
    },
    enabled: sectionIds.length > 0,
  });
}

// ─── Instances ───
export function useChecklistInstances(status?: string) {
  return useQuery({
    queryKey: ['checklist-instances', status],
    queryFn: async () => {
      const filters: Record<string, any> = {};
      if (status) filters.status = status;
      const data = await invoke({ operation: 'list', table: 'checklist_instances', listOptions: { orderBy: 'created_at', orderAsc: false, filters } });
      return (data?.records || []) as ChecklistInstance[];
    },
  });
}

export function useChecklistInstanceItems(instanceId: string | null) {
  return useQuery({
    queryKey: ['checklist-instance-items', instanceId],
    queryFn: async () => {
      const data = await invoke({ operation: 'list', table: 'checklist_instance_items', listOptions: { filters: { instance_id: instanceId }, orderBy: 'display_order', orderAsc: true, limit: 500 } });
      return (data?.records || []) as ChecklistInstanceItem[];
    },
    enabled: !!instanceId,
  });
}

// ─── Mutations ───
export function useChecklistMutations() {
  const qc = useQueryClient();

  const createTemplate = useMutation({
    mutationFn: async (data: Partial<ChecklistTemplate>) => {
      return invoke({ operation: 'insert', table: 'checklist_templates', data });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['checklist-templates'] }); toast.success('Template created'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<ChecklistTemplate>) => {
      return invoke({ operation: 'update', table: 'checklist_templates', recordId: id, data });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['checklist-templates'] }); toast.success('Template updated'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => invoke({ operation: 'delete', table: 'checklist_templates', recordId: id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['checklist-templates'] }); toast.success('Template deleted'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const createSection = useMutation({
    mutationFn: async (data: Partial<ChecklistSection>) => invoke({ operation: 'insert', table: 'checklist_template_sections', data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['checklist-template-sections'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateSection = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<ChecklistSection>) => invoke({ operation: 'update', table: 'checklist_template_sections', recordId: id, data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['checklist-template-sections'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteSection = useMutation({
    mutationFn: async (id: string) => invoke({ operation: 'delete', table: 'checklist_template_sections', recordId: id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['checklist-template-sections'] }); qc.invalidateQueries({ queryKey: ['checklist-template-items'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const createItem = useMutation({
    mutationFn: async (data: Partial<ChecklistItem>) => invoke({ operation: 'insert', table: 'checklist_template_items', data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['checklist-template-items'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<ChecklistItem>) => invoke({ operation: 'update', table: 'checklist_template_items', recordId: id, data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['checklist-template-items'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => invoke({ operation: 'delete', table: 'checklist_template_items', recordId: id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['checklist-template-items'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Instance mutations
  const createInstance = useMutation({
    mutationFn: async (data: Partial<ChecklistInstance>) => invoke({ operation: 'insert', table: 'checklist_instances', data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['checklist-instances'] }); toast.success('Checklist generated'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateInstance = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<ChecklistInstance>) => invoke({ operation: 'update', table: 'checklist_instances', recordId: id, data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['checklist-instances'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteInstance = useMutation({
    mutationFn: async (id: string) => invoke({ operation: 'delete', table: 'checklist_instances', recordId: id }),
    onSuccess: (_: any, id: string) => {
      qc.invalidateQueries({ queryKey: ['checklist-instances'] });
      logActivityDirect({ actionType: 'checklist_deleted', entityType: 'checklist', entityId: id });
      toast.success('Checklist deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createInstanceItem = useMutation({
    mutationFn: async (data: Partial<ChecklistInstanceItem>) => invoke({ operation: 'insert', table: 'checklist_instance_items', data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['checklist-instance-items'] }); },
  });

  const updateInstanceItem = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<ChecklistInstanceItem>) => invoke({ operation: 'update', table: 'checklist_instance_items', recordId: id, data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['checklist-instance-items'] }); qc.invalidateQueries({ queryKey: ['checklist-instances'] }); },
  });

  const generateFromTemplate = useMutation({
    mutationFn: async (template: ChecklistTemplate) => {
      // 1. Create instance
      const instanceResult = await invoke({
        operation: 'insert',
        table: 'checklist_instances',
        data: {
          template_id: template.id,
          name: template.name,
          description: template.description,
          icon: template.icon,
          generated_by: 'manual',
          status: 'in_progress',
          progress_percent: 0,
        },
      });
      const instance = instanceResult?.record;
      if (!instance) throw new Error('Failed to create instance');

      // 2. Fetch sections
      const sectionsResult = await invoke({
        operation: 'list',
        table: 'checklist_template_sections',
        listOptions: { filters: { template_id: template.id }, orderBy: 'display_order', orderAsc: true },
      });
      const sections = sectionsResult?.records || [];

      // 3. Fetch items for each section and create instance items
      for (const section of sections) {
        const itemsResult = await invoke({
          operation: 'list',
          table: 'checklist_template_items',
          listOptions: { filters: { section_id: section.id }, orderBy: 'display_order', orderAsc: true },
        });
        const items = itemsResult?.records || [];
        for (const item of items) {
          await invoke({
            operation: 'insert',
            table: 'checklist_instance_items',
            data: {
              instance_id: instance.id,
              section_title: section.title,
              section_icon: section.icon,
              section_order: section.display_order,
              label: item.label,
              is_checked: item.is_pre_checked || false,
              display_order: item.display_order,
            },
          });
        }
      }

      return instance;
    },
    onSuccess: (_: any, template: ChecklistTemplate) => {
      qc.invalidateQueries({ queryKey: ['checklist-instances'] });
      logActivityDirect({
        actionType: 'checklist_generated',
        entityType: 'checklist',
        entityName: template.name,
        metadata: { template_id: template.id }
      });
      toast.success('Fresh checklist generated from template');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    createTemplate, updateTemplate, deleteTemplate,
    createSection, updateSection, deleteSection,
    createItem, updateItem, deleteItem,
    createInstance, updateInstance, deleteInstance,
    createInstanceItem, updateInstanceItem,
    generateFromTemplate,
  };
}
