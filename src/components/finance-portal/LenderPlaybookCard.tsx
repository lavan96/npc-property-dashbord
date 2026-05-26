import { useEffect, useState, useCallback } from 'react';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, BookOpen, Clock, TrendingUp, Phone, Mail, Pencil } from 'lucide-react';
import { LenderPlaybookEditorDialog } from './LenderPlaybookEditorDialog';

interface Props {
  lender: string | null | undefined;
  isSuperadmin?: boolean;
}

const normalizeKey = (s: string) =>
  String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export function LenderPlaybookCard({ lender, isSuperadmin = false }: Props) {
  const { invokeFinanceFunction } = useFinancePortalAuth();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const lenderKey = lender ? normalizeKey(lender) : '';

  const load = useCallback(async () => {
    if (!lenderKey) return;
    setLoading(true);
    const { data: res } = await invokeFinanceFunction(
      'finance-portal-lender-intelligence',
      { operation: 'get_playbook', lender_key: lenderKey },
    );
    setData(res || null);
    setLoading(false);
  }, [lenderKey, invokeFinanceFunction]);

  useEffect(() => { void load(); }, [load]);

  if (!lender) {
    return (
      <Card className="border-dashed border-border/60 bg-card/30">
        <CardContent className="p-4 text-sm text-muted-foreground">
          Set a lender on this file to see its playbook.
        </CardContent>
      </Card>
    );
  }

  const pb = data?.playbook;
  const stats = data?.stats;
  const turnaround = pb?.typical_turnaround_days_override ?? stats?.median_days_to_approval;

  return (
    <>
      <Card className="border-border/60 bg-card/40">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">{lender} Playbook</h3>
            </div>
            {isSuperadmin && (
              <Button size="sm" variant="ghost" onClick={() => setEditorOpen(true)}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-md bg-muted/40 p-2">
                  <Clock className="h-3.5 w-3.5 mx-auto text-muted-foreground" />
                  <p className="text-lg font-bold mt-1">
                    {turnaround != null ? `${turnaround}d` : '—'}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Turnaround
                  </p>
                </div>
                <div className="rounded-md bg-muted/40 p-2">
                  <TrendingUp className="h-3.5 w-3.5 mx-auto text-muted-foreground" />
                  <p className="text-lg font-bold mt-1">
                    {stats?.approval_rate_pct != null ? `${stats.approval_rate_pct}%` : '—'}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Approval
                  </p>
                </div>
                <div className="rounded-md bg-muted/40 p-2">
                  <p className="text-lg font-bold">
                    {pb?.rate_band_pa != null ? `${Number(pb.rate_band_pa).toFixed(2)}%` : '—'}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Rate band p.a.
                  </p>
                </div>
              </div>

              {pb?.quirks && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                    Quirks
                  </p>
                  <p className="text-xs whitespace-pre-wrap">{pb.quirks}</p>
                </div>
              )}

              {pb?.document_rules && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                    Document rules
                  </p>
                  <p className="text-xs whitespace-pre-wrap">{pb.document_rules}</p>
                </div>
              )}

              {(pb?.bdm_name || pb?.bdm_email || pb?.bdm_phone) && (
                <div className="border-t border-border/40 pt-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                    BDM
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {pb.bdm_name && <Badge variant="outline">{pb.bdm_name}</Badge>}
                    {pb.bdm_phone && (
                      <a
                        href={`tel:${pb.bdm_phone}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Phone className="h-3 w-3" /> {pb.bdm_phone}
                      </a>
                    )}
                    {pb.bdm_email && (
                      <a
                        href={`mailto:${pb.bdm_email}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Mail className="h-3 w-3" /> {pb.bdm_email}
                      </a>
                    )}
                  </div>
                </div>
              )}

              {!pb && (
                <p className="text-xs text-muted-foreground italic">
                  No playbook yet for this lender.
                  {isSuperadmin && ' Click Edit to add one.'}
                </p>
              )}

              {stats?.sample_size > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  Based on {stats.sample_size} submission(s) in the last 24 months.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {isSuperadmin && (
        <LenderPlaybookEditorDialog
          open={editorOpen}
          onOpenChange={setEditorOpen}
          lenderKey={lenderKey}
          lenderLabel={lender}
          initial={pb}
          onSaved={() => { setEditorOpen(false); void load(); }}
        />
      )}
    </>
  );
}
