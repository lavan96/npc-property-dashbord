/**
 * Hook for CRUD on `report_templates` and `report_template_versions`
 * via the secure `manage-templates` edge function.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { toast } from 'sonner';
import {
  type ReportTemplate,
  parseTemplate,
  makeBlankTemplate,
} from '@/lib/reportTemplate/templateSchema';

const LIST_KEY = ['report-templates'] as const;
const ONE_KEY = (id: string) => ['report-templates', id] as const;
const VERS_KEY = (id: string) => ['report-templates', id, 'versions'] as const;

export interface ReportTemplateRow {
  id: string;
  name: string;
  description: string | null;
  report_type: string | null;
  tier: string | null;
  schema: ReportTemplate;
  version: number;
  is_active: boolean;
  is_default: boolean;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}

function normaliseRow(raw: any): ReportTemplateRow {
  return {
    ...raw,
    schema: parseTemplate(raw?.schema),
  };
}

// ─── List ─────────────────────────────────────────────────────────────────────
export function useReportTemplates() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction('manage-templates', {
        operation: 'list',
        table: 'report_templates',
        listOptions: { orderBy: 'updated_at', orderAsc: false },
      });
      if (error) throw new Error(error.message);
      return ((data?.records || []) as any[]).map(normaliseRow);
    },
  });
}

// ─── Single ───────────────────────────────────────────────────────────────────
export function useReportTemplate(id: string | undefined) {
  return useQuery({
    queryKey: id ? ONE_KEY(id) : ['report-templates', 'none'],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction('manage-templates', {
        operation: 'get',
        table: 'report_templates',
        recordId: id,
      });
      if (error) throw new Error(error.message);
      return normaliseRow(data?.record);
    },
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────
export function useReportTemplateMutations() {
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: async (init: Partial<ReportTemplateRow>) => {
      const { data, error } = await invokeSecureFunction('manage-templates', {
        operation: 'insert',
        table: 'report_templates',
        data: {
          name: init.name || 'Untitled template',
          description: init.description ?? null,
          report_type: init.report_type ?? null,
          tier: init.tier ?? null,
          schema: init.schema ?? makeBlankTemplate(),
          version: 1,
          is_active: false,
          is_default: false,
        },
      });
      if (error) throw new Error(error.message);
      return data?.record;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      toast.success('Template created');
    },
    onError: (e: Error) => toast.error(`Create failed: ${e.message}`),
  });

  const update = useMutation({
    mutationFn: async (args: { id: string; patch: Partial<ReportTemplateRow>; snapshot?: boolean; note?: string }) => {
      const { id, patch, snapshot, note } = args;
      // Optionally snapshot current version first
      if (snapshot) {
        const current = await invokeSecureFunction('manage-templates', {
          operation: 'get',
          table: 'report_templates',
          recordId: id,
        });
        const cur = current.data?.record;
        if (cur) {
          await invokeSecureFunction('manage-templates', {
            operation: 'insert',
            table: 'report_template_versions',
            data: {
              template_id: id,
              version: cur.version || 1,
              schema: cur.schema,
              note: note ?? null,
            },
          });
          patch.version = (cur.version || 1) + 1;
        }
      }
      const { data, error } = await invokeSecureFunction('manage-templates', {
        operation: 'update',
        table: 'report_templates',
        recordId: id,
        data: patch,
      });
      if (error) throw new Error(error.message);
      return data?.record;
    },
    onSuccess: (_data, args) => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.invalidateQueries({ queryKey: ONE_KEY(args.id) });
      qc.invalidateQueries({ queryKey: VERS_KEY(args.id) });
    },
    onError: (e: Error) => toast.error(`Save failed: ${e.message}`),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await invokeSecureFunction('manage-templates', {
        operation: 'delete',
        table: 'report_templates',
        recordId: id,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      toast.success('Template deleted');
    },
    onError: (e: Error) => toast.error(`Delete failed: ${e.message}`),
  });

  return { create, update, remove };
}

// ─── Version history ──────────────────────────────────────────────────────────
export function useReportTemplateVersions(templateId: string | undefined) {
  return useQuery({
    queryKey: templateId ? VERS_KEY(templateId) : ['report-templates', 'no-versions'],
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction('manage-templates', {
        operation: 'list',
        table: 'report_template_versions',
        listOptions: {
          orderBy: 'version',
          orderAsc: false,
          filters: { template_id: templateId },
        },
      });
      if (error) throw new Error(error.message);
      return (data?.records || []) as Array<{
        id: string;
        version: number;
        schema: ReportTemplate;
        note: string | null;
        created_at: string;
      }>;
    },
  });
}
