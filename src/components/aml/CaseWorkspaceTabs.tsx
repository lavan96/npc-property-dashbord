/**
 * Phase 4 — Case-centred Customer Compliance register.
 *
 * All KYC surfaces (Verification, Screening, Risk) collapse into tabs
 * scoped to a single case_id. Legacy top-nav pages are preserved as
 * alias routes; this component is the new default entry point.
 *
 * Guardrails (AGENTS.md §2):
 *   - Restricted counts / previews never rendered outside authorised
 *     capabilities; write actions gated by `canWrite`.
 *   - No new data model — reuses existing amlVerificationApi / amlRiskApi.
 */
import React, { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ShieldCheck, ScanSearch, Gauge, ClipboardList, Play } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  amlVerificationApi, type IdentityCheck, type ScreeningCheck,
} from "@/lib/aml/amlVerificationApi";
import {
  amlRiskApi, type AmlRiskAssessment, type AmlCaseCondition, type AmlDecision,
} from "@/lib/aml/amlRiskApi";
import type { AmlCase, AmlCaseEvent } from "@/lib/aml/amlCasesApi";

interface Props {
  caseRow: AmlCase;
  events: AmlCaseEvent[];
  canWrite: boolean;
  canInvestigate: boolean;
  onChanged: () => void;
}

export function CaseWorkspaceTabs({ caseRow, events, canWrite, canInvestigate, onChanged }: Props) {
  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="overview">
          <ClipboardList className="h-3.5 w-3.5 mr-1.5" /> Overview
        </TabsTrigger>
        <TabsTrigger value="verification">
          <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Verification
        </TabsTrigger>
        <TabsTrigger value="screening">
          <ScanSearch className="h-3.5 w-3.5 mr-1.5" /> Screening
        </TabsTrigger>
        <TabsTrigger value="risk">
          <Gauge className="h-3.5 w-3.5 mr-1.5" /> Risk & Decision
        </TabsTrigger>
        <TabsTrigger value="audit">Audit</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-4">
        <OverviewTab caseRow={caseRow} />
      </TabsContent>
      <TabsContent value="verification" className="mt-4">
        <VerificationTab caseId={caseRow.id} canWrite={canWrite} onChanged={onChanged} />
      </TabsContent>
      <TabsContent value="screening" className="mt-4">
        <ScreeningTab caseId={caseRow.id} canWrite={canInvestigate} onChanged={onChanged} />
      </TabsContent>
      <TabsContent value="risk" className="mt-4">
        <RiskTab caseId={caseRow.id} canWrite={canWrite} onChanged={onChanged} />
      </TabsContent>
      <TabsContent value="audit" className="mt-4">
        <AuditTab events={events} />
      </TabsContent>
    </Tabs>
  );
}

/* -------------------- Overview -------------------- */

function OverviewTab({ caseRow }: { caseRow: AmlCase }) {
  const activation = (caseRow as any)?.metadata?.activation;
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Case snapshot</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        <Row k="Reference" v={caseRow.case_reference} />
        <Row k="Subject" v={`${caseRow.subject_display_name} (${caseRow.subject_type})`} />
        <Row k="Status" v={caseRow.status} />
        <Row k="Risk" v={caseRow.risk_rating ?? "unrated"} />
        <Row k="Opened" v={new Date(caseRow.opened_at).toLocaleString()} />
        {activation ? (
          <>
            <div className="pt-2 text-xs font-semibold text-muted-foreground uppercase">
              Activation
            </div>
            <Row k="Model" v={`Model ${activation.model}`} />
            <Row k="Event" v={activation.event ?? "—"} />
            {activation.program_version && (
              <Row k="Program version" v={activation.program_version} />
            )}
            <Row k="Confirmed by" v={activation.activated_by_email ?? "—"} />
          </>
        ) : (
          <p className="text-xs text-muted-foreground pt-2">
            No activation metadata recorded (legacy case).
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}

/* -------------------- Verification -------------------- */

function VerificationTab({ caseId, canWrite, onChanged }: { caseId: string; canWrite: boolean; onChanged: () => void }) {
  const [items, setItems] = useState<IdentityCheck[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { setItems((await amlVerificationApi.listIdv(caseId)).identity_checks); }
    catch (e: any) { toast({ title: "Load failed", description: e.message, variant: "destructive" }); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [caseId]);

  const runIdv = async () => {
    setBusy(true);
    try {
      await amlVerificationApi.initiateIdv(caseId);
      toast({ title: "IDV initiated" });
      await load(); onChanged();
    } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Identity verification</CardTitle>
        {canWrite && (
          <Button size="sm" onClick={runIdv} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
            Initiate IDV
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {items === null ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No IDV checks yet for this case.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((r) => (
              <li key={r.id} className="flex items-center justify-between text-sm border-b border-border/50 py-2">
                <div>
                  <div className="font-medium">{r.subject_label}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.provider} · {r.method} · {new Date(r.requested_at).toLocaleString()}
                  </div>
                </div>
                <Badge variant="outline">{r.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------- Screening -------------------- */

function ScreeningTab({ caseId, canWrite, onChanged }: { caseId: string; canWrite: boolean; onChanged: () => void }) {
  const [items, setItems] = useState<ScreeningCheck[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { setItems((await amlVerificationApi.listScreening(caseId)).screening_checks); }
    catch (e: any) { toast({ title: "Load failed", description: e.message, variant: "destructive" }); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [caseId]);

  const runScreen = async () => {
    setBusy(true);
    try {
      await amlVerificationApi.runScreening(caseId, ["pep", "sanctions", "adverse_media"]);
      toast({ title: "Screening initiated" });
      await load(); onChanged();
    } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">PEP · Sanctions · Adverse media</CardTitle>
        {canWrite && (
          <Button size="sm" onClick={runScreen} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
            Run screening
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {items === null ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No screening checks yet for this case.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((s) => (
              <li key={s.id} className="flex items-center justify-between text-sm border-b border-border/50 py-2">
                <div>
                  <div className="font-medium">{s.subject_label}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.provider} · {(s.scope || []).join(", ")} · {new Date(s.requested_at).toLocaleString()}
                  </div>
                </div>
                <Badge variant="outline">{s.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------- Risk & Decision -------------------- */

function RiskTab({ caseId, canWrite, onChanged }: { caseId: string; canWrite: boolean; onChanged: () => void }) {
  const [assessments, setAssessments] = useState<AmlRiskAssessment[] | null>(null);
  const [conditions, setConditions] = useState<AmlCaseCondition[]>([]);
  const [latestDecision, setLatestDecision] = useState<AmlDecision | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [a, c, d] = await Promise.all([
        amlRiskApi.listAssessments(caseId),
        amlRiskApi.listConditions(caseId),
        amlRiskApi.latestDecision(caseId),
      ]);
      setAssessments(a.assessments); setConditions(c.conditions); setLatestDecision(d.decision);
    } catch (e: any) { toast({ title: "Load failed", description: e.message, variant: "destructive" }); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [caseId]);

  const evaluate = async () => {
    setBusy(true);
    try {
      const res = await amlRiskApi.evaluate(caseId, {});
      if (res.auto_decision) {
        toast({ title: "Auto-cleared", description: `Straight-through under policy ${res.program_version}.` });
      } else {
        toast({ title: "Risk re-evaluated", description: `Policy ${res.program_version}` });
      }
      await load(); onChanged();
    } catch (e: any) { toast({ title: "Evaluate failed", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const latest = assessments?.[0];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-sm">Latest risk assessment</CardTitle>
            {latest?.program_version && (
              <Badge variant="outline" className="border-primary/40 text-primary text-[10px] uppercase">
                Policy {latest.program_version}
              </Badge>
            )}
            {latest?.straight_through && (
              <Badge variant="outline" className="border-success/40 text-success text-[10px] uppercase">
                Auto-cleared
              </Badge>
            )}
          </div>
          {canWrite && (
            <Button size="sm" variant="outline" onClick={evaluate} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null} Re-evaluate
            </Button>
          )}
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          {assessments === null ? <Loader2 className="h-4 w-4 animate-spin" /> :
            !latest ? <p className="text-muted-foreground">No assessments yet.</p> :
            <>
              <Row k="Rating" v={latest.risk_rating?.toUpperCase() ?? "—"} />
              <Row k="MLTF score" v={String(latest.mltf_score)} />
              <Row k="Verification score" v={String(latest.verification_score)} />
              <Row k="Completion score" v={String(latest.completion_score)} />
              <Row k="Computed" v={new Date(latest.created_at).toLocaleString()} />
              {latest.policy_snapshot_hash && (
                <Row k="Policy hash" v={<span className="font-mono text-[11px]">{latest.policy_snapshot_hash.slice(0, 12)}…</span>} />
              )}
              {latest.triggered_holds?.length > 0 && (
                <div className="pt-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase">Triggered holds</div>
                  <ul className="mt-1 space-y-1">
                    {latest.triggered_holds.map((h) => (
                      <li key={h.key}>
                        <Badge variant="outline" className={h.severity === "block" ? "border-destructive/40 text-destructive" : "border-yellow-500/40 text-yellow-500"}>
                          {h.severity.toUpperCase()}
                        </Badge>{" "}
                        {h.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {latest.explanation && (latest.explanation.top_positive?.length || latest.explanation.top_neutral_missing?.length) ? (
                <div className="pt-2 border-t border-border/50">
                  <div className="text-xs font-semibold text-muted-foreground uppercase">Why this rating</div>
                  {latest.explanation.top_positive && latest.explanation.top_positive.length > 0 && (
                    <div className="mt-1">
                      <div className="text-[11px] text-muted-foreground">Top contributors</div>
                      <ul className="mt-0.5 space-y-0.5">
                        {latest.explanation.top_positive.map((f) => (
                          <li key={f.key} className="text-xs flex justify-between gap-4">
                            <span className="truncate">{f.label}</span>
                            <span className="font-mono text-muted-foreground">+{Math.round(f.weighted)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {latest.explanation.top_neutral_missing && latest.explanation.top_neutral_missing.length > 0 && (
                    <div className="mt-2">
                      <div className="text-[11px] text-muted-foreground">Missing inputs (scored 0)</div>
                      <ul className="mt-0.5 space-y-0.5">
                        {latest.explanation.top_neutral_missing.slice(0, 3).map((f) => (
                          <li key={f.key} className="text-xs text-muted-foreground truncate">• {f.label}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : null}
            </>}
        </CardContent>
      </Card>


      <Card>
        <CardHeader><CardTitle className="text-sm">Open conditions</CardTitle></CardHeader>
        <CardContent>
          {conditions.filter(c => c.status === "open").length === 0 ? (
            <p className="text-sm text-muted-foreground">No open conditions.</p>
          ) : (
            <ul className="space-y-2">
              {conditions.filter(c => c.status === "open").map((c) => (
                <li key={c.id} className="text-sm border-b border-border/50 py-2">
                  <div className="font-medium">{c.label}</div>
                  {c.detail && <div className="text-xs text-muted-foreground">{c.detail}</div>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Latest decision</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {!latestDecision ? (
            <p className="text-muted-foreground">No decision recorded.</p>
          ) : (
            <>
              <Row k="Outcome" v={latestDecision.outcome} />
              <Row k="Decided" v={new Date(latestDecision.decided_at).toLocaleString()} />
              {latestDecision.rationale && (
                <div className="mt-2 rounded bg-muted/40 p-2 text-xs">{latestDecision.rationale}</div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------- Audit -------------------- */

function AuditTab({ events }: { events: AmlCaseEvent[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Audit trail (hash-chained)</CardTitle></CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events yet.</p>
        ) : (
          <ScrollArea className="max-h-[420px] pr-3">
            <ol className="space-y-3">
              {events.map((ev) => (
                <li key={ev.id} className="border-l-2 border-border pl-3">
                  <div className="text-xs text-muted-foreground">
                    {new Date(ev.created_at).toLocaleString()} · {ev.category}
                  </div>
                  <div className="text-sm">{ev.summary}</div>
                  {ev.actor_label && (
                    <div className="text-xs text-muted-foreground">by {ev.actor_label}</div>
                  )}
                  {ev.row_hash && (
                    <div className="text-[10px] font-mono text-muted-foreground truncate">
                      hash {ev.row_hash.slice(0, 16)}…
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
