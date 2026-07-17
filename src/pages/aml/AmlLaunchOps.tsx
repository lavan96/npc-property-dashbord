import { useEffect, useMemo, useState } from "react";
import { invokeAmlFunction } from "@/lib/aml/invokeAmlFunction";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Rocket, ClipboardCheck, ShieldAlert, RefreshCw, ArrowRight, ArrowLeft, Plus } from "lucide-react";

const STAGES = ["internal_dev_only", "admin_limited", "controlled_team_rollout", "broad_production"] as const;
type Stage = typeof STAGES[number];

const stageLabel: Record<Stage, string> = {
  internal_dev_only: "Internal (dev only)",
  admin_limited: "Admin-limited",
  controlled_team_rollout: "Controlled team rollout",
  broad_production: "Broad production",
};

type Scenario = {
  id: string; code: string; title: string; description: string | null; phase: string | null; category: string | null;
  requirement_refs: string[]; steps: any[]; last_status: string; last_run_at: string | null;
  last_run_by_label: string | null; last_run_notes: string | null; is_active: boolean;
};
type Risk = {
  id: string; code: string; title: string; description: string | null; category: string | null;
  likelihood: string; impact: string; status: string; owner_label: string | null;
  mitigation: string | null; next_review_at: string | null;
};
type HistoryRow = { id: string; from_stage: string | null; to_stage: string; changed_by_label: string | null; reason: string | null; created_at: string };
type Readiness = {
  gate_pass: boolean;
  gate_status: string;
  gate_ran_at: string | null;
  failing_scenarios: string[];
  open_critical_risks: string[];
  broad_production_ready: boolean;
};
type Summary = {
  rollout: { rollout_stage: Stage; rollout_stage_since?: string; rollout_notes?: string | null };
  scenarios: { total: number; by_status: Record<string, number> };
  risks: { total: number; by_status: Record<string, number> };
  recent_history: HistoryRow[];
  readiness?: Readiness;
  my_role_is_mlro: boolean;
};

const badgeFor = (s: string, kind: "scenario" | "risk" | "stage" = "scenario") => {
  const map: Record<string, string> = {
    passed: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    failed: "bg-red-500/15 text-red-500 border-red-500/30",
    blocked: "bg-red-500/15 text-red-500 border-red-500/30",
    waived: "bg-muted text-muted-foreground border-muted",
    not_run: "bg-muted text-muted-foreground border-muted",
    open: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    mitigated: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    accepted: "bg-blue-500/15 text-blue-500 border-blue-500/30",
    retired: "bg-muted text-muted-foreground border-muted",
    high: "bg-red-500/15 text-red-500 border-red-500/30",
    critical: "bg-red-500/15 text-red-500 border-red-500/30",
    medium: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    low: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  };
  return <Badge variant="outline" className={map[s] ?? ""}>{s.replace(/_/g, " ")}</Badge>;
};

async function callOp(op: string, extra: Record<string, unknown> = {}) {
  return invokeAmlFunction<any>("aml-launch-ops", { op, ...extra });
}

export default function AmlLaunchOps() {
  const [tab, setTab] = useState("rollout");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [s, sc, rk, hi] = await Promise.all([
        callOp("summary"), callOp("list_scenarios"), callOp("list_risks"), callOp("rollout_history"),
      ]);
      setSummary(s);
      setScenarios(sc.scenarios ?? []);
      setRisks(rk.risks ?? []);
      setHistory(hi.history ?? []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void loadAll(); }, []);

  const stageIdx = summary ? STAGES.indexOf(summary.rollout.rollout_stage) : 0;
  const nextStage = stageIdx < STAGES.length - 1 ? STAGES[stageIdx + 1] : null;
  const prevStage = stageIdx > 0 ? STAGES[stageIdx - 1] : null;
  const isMlro = summary?.my_role_is_mlro;

  const changeStage = async (to: Stage, reason: string, direction: "advance" | "rollback") => {
    try {
      await callOp(direction === "advance" ? "advance_rollout" : "rollback_rollout", { to_stage: to, reason });
      toast.success(`Moved to ${stageLabel[to]}`);
      await loadAll();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Rocket className="h-6 w-6 text-primary" /> AML Launch Operations
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl mt-1">
            Progressive rollout gates, acceptance-scenario traceability, and the operational risk register.
            Read-only for analysts and reporters. MLRO signs off every stage transition.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3 min-w-[140px]">
            <div className="text-xs text-muted-foreground">Current stage</div>
            <div className="mt-1 font-medium text-sm">{summary ? stageLabel[summary.rollout.rollout_stage] : <Skeleton className="h-4 w-24" />}</div>
          </Card>
          <Card className="p-3 min-w-[140px]">
            <div className="text-xs text-muted-foreground">Scenarios passing</div>
            <div className="mt-1 text-lg font-semibold">
              {summary ? `${summary.scenarios.by_status.passed ?? 0}/${summary.scenarios.total}` : "…"}
            </div>
          </Card>
          <Card className="p-3 min-w-[140px]">
            <div className="text-xs text-muted-foreground">Open risks</div>
            <div className="mt-1 text-lg font-semibold">{summary ? (summary.risks.by_status.open ?? 0) : "…"}</div>
          </Card>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="rollout"><Rocket className="h-4 w-4 mr-1" /> Rollout</TabsTrigger>
          <TabsTrigger value="scenarios"><ClipboardCheck className="h-4 w-4 mr-1" /> Acceptance</TabsTrigger>
          <TabsTrigger value="risks"><ShieldAlert className="h-4 w-4 mr-1" /> Risks</TabsTrigger>
        </TabsList>

        {/* Rollout */}
        <TabsContent value="rollout" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Rollout stage</CardTitle>
                <CardDescription>Gate the AML programme through four stages. Broad production requires a passing release gate.</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={loadAll}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-4 gap-2">
                {STAGES.map((s, i) => (
                  <div key={s} className={`border rounded-md p-3 text-sm ${i === stageIdx ? "border-primary bg-primary/5" : "border-border"}`}>
                    <div className="text-xs text-muted-foreground">Stage {i + 1}</div>
                    <div className="font-medium">{stageLabel[s]}</div>
                    {i === stageIdx && summary?.rollout.rollout_stage_since && (
                      <div className="text-xs text-muted-foreground mt-1">since {new Date(summary.rollout.rollout_stage_since).toLocaleString()}</div>
                    )}
                  </div>
                ))}
              </div>
              {!isMlro && (
                <Alert><AlertTitle>Read-only</AlertTitle>
                  <AlertDescription>Only MLROs can change the rollout stage.</AlertDescription></Alert>
              )}
              {isMlro && (
                <div className="flex flex-wrap gap-2">
                  {prevStage && (
                    <StageChangeButton direction="rollback" from={summary!.rollout.rollout_stage} to={prevStage} onConfirm={(reason) => changeStage(prevStage, reason, "rollback")} />
                  )}
                  {nextStage && (
                    <StageChangeButton direction="advance" from={summary!.rollout.rollout_stage} to={nextStage} onConfirm={(reason) => changeStage(nextStage, reason, "advance")} />
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Stage history</CardTitle></CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-24 w-full" /> : history.length === 0 ? (
                <div className="text-sm text-muted-foreground">No stage transitions recorded yet.</div>
              ) : (
                <div className="space-y-2">
                  {history.map((h) => (
                    <div key={h.id} className="flex items-center justify-between flex-wrap gap-2 text-sm border rounded-md p-2">
                      <div className="flex items-center gap-2">
                        {badgeFor(h.to_stage, "stage")}
                        <span className="text-xs text-muted-foreground">from {h.from_stage ?? "—"} · {h.changed_by_label ?? "system"}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString()}</div>
                      {h.reason && <div className="w-full text-xs text-muted-foreground italic">{h.reason}</div>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Acceptance */}
        <TabsContent value="scenarios" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Acceptance scenarios</CardTitle>
                <CardDescription>End-to-end scenarios traceable back to the report requirements (§22).</CardDescription>
              </div>
              {isMlro && <ScenarioDialog onSaved={loadAll} />}
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-32 w-full" /> : scenarios.length === 0 ? (
                <EmptyScenarioNotice />
              ) : (
                <div className="space-y-2">
                  {scenarios.map((s) => (
                    <ScenarioRow key={s.id} s={s} isMlro={!!isMlro} onChanged={loadAll} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Risks */}
        <TabsContent value="risks" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Risk register</CardTitle>
                <CardDescription>Governance risks tracked to owner, mitigation and review cycle (§23).</CardDescription>
              </div>
              {isMlro && <RiskDialog onSaved={loadAll} />}
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-32 w-full" /> : risks.length === 0 ? (
                <div className="text-sm text-muted-foreground">No risks captured yet.</div>
              ) : (
                <div className="space-y-2">
                  {risks.map((r) => (
                    <RiskRow key={r.id} r={r} isMlro={!!isMlro} onChanged={loadAll} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyScenarioNotice() {
  return (
    <Alert>
      <AlertTitle>No scenarios yet</AlertTitle>
      <AlertDescription>
        MLRO can add tenant-specific acceptance scenarios here. Baseline scenarios also live in
        <code className="mx-1">docs/aml/acceptance-scenarios.md</code>.
      </AlertDescription>
    </Alert>
  );
}

function StageChangeButton({ direction, from, to, onConfirm }: {
  direction: "advance" | "rollback"; from: Stage; to: Stage; onConfirm: (reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const Icon = direction === "advance" ? ArrowRight : ArrowLeft;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={direction === "advance" ? "default" : "outline"}>
          <Icon className="h-4 w-4 mr-2" />
          {direction === "advance" ? "Advance to" : "Roll back to"} {stageLabel[to]}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{direction === "advance" ? "Advance" : "Roll back"} rollout stage</DialogTitle></DialogHeader>
        <div className="space-y-2 text-sm">
          <div>From <strong>{stageLabel[from]}</strong> to <strong>{stageLabel[to]}</strong>.</div>
          <Label>Reason / evidence</Label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Link UAT evidence, gate ID, or incident reference…" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => { onConfirm(reason); setOpen(false); }}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScenarioRow({ s, isMlro, onChanged }: { s: Scenario; isMlro: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const record = async (status: string) => {
    setBusy(true);
    try {
      await callOp("record_scenario_result", { id: s.id, status, notes: null });
      toast.success(`Marked ${status}`);
      onChanged();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            {badgeFor(s.last_status)}
            <span className="font-mono text-xs text-muted-foreground">{s.code}</span>
            {s.phase && <Badge variant="secondary" className="text-xs">{s.phase}</Badge>}
            <span className="font-medium">{s.title}</span>
          </div>
          {s.description && <div className="text-xs text-muted-foreground mt-1">{s.description}</div>}
          {s.requirement_refs.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {s.requirement_refs.map(r => <Badge key={r} variant="outline" className="text-[10px]">{r}</Badge>)}
            </div>
          )}
        </div>
        <div className="text-xs text-muted-foreground text-right">
          {s.last_run_at ? <>Last run {new Date(s.last_run_at).toLocaleString()}{s.last_run_by_label ? ` · ${s.last_run_by_label}` : ""}</> : "Never run"}
        </div>
      </div>
      {isMlro && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => record("passed")}>Mark passed</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => record("failed")}>Failed</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => record("blocked")}>Blocked</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => record("waived")}>Waive</Button>
        </div>
      )}
    </div>
  );
}

function ScenarioDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", title: "", phase: "", category: "", description: "", requirement_refs: "" });
  const save = async () => {
    try {
      await callOp("upsert_scenario", {
        code: form.code, title: form.title, phase: form.phase || null, category: form.category || null,
        description: form.description || null,
        requirement_refs: form.requirement_refs.split(",").map(s => s.trim()).filter(Boolean),
      });
      toast.success("Scenario saved"); setOpen(false); onSaved();
      setForm({ code: "", title: "", phase: "", category: "", description: "", requirement_refs: "" });
    } catch (e: any) { toast.error(e.message); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> New scenario</Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New acceptance scenario</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value }))} placeholder="AS-01" /></div>
            <div><Label>Phase</Label><Input value={form.phase} onChange={(e) => setForm(f => ({ ...f, phase: e.target.value }))} placeholder="Phase 3" /></div>
          </div>
          <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} /></div>
          <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Onboarding, Screening, Reporting…" /></div>
          <div><Label>Requirement refs (comma-separated)</Label>
            <Input value={form.requirement_refs} onChange={(e) => setForm(f => ({ ...f, requirement_refs: e.target.value }))} placeholder="AUSTRAC-CDD-1, AML-POL-4.2" />
          </div>
          <div><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RiskRow({ r, isMlro, onChanged }: { r: Risk; isMlro: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const update = async (status: string) => {
    setBusy(true);
    try {
      await callOp("upsert_risk", { ...r, status });
      toast.success(`Risk marked ${status}`); onChanged();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            {badgeFor(r.status, "risk")}
            <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
            {r.category && <Badge variant="secondary" className="text-xs">{r.category}</Badge>}
            <span className="font-medium">{r.title}</span>
          </div>
          {r.description && <div className="text-xs text-muted-foreground mt-1">{r.description}</div>}
          {r.mitigation && <div className="text-xs mt-1"><strong>Mitigation:</strong> {r.mitigation}</div>}
        </div>
        <div className="text-xs text-right space-y-1">
          <div>Likelihood {badgeFor(r.likelihood)}</div>
          <div>Impact {badgeFor(r.impact)}</div>
          {r.owner_label && <div className="text-muted-foreground">Owner: {r.owner_label}</div>}
          {r.next_review_at && <div className="text-muted-foreground">Review {new Date(r.next_review_at).toLocaleDateString()}</div>}
        </div>
      </div>
      {isMlro && r.status !== "retired" && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => update("mitigated")}>Mark mitigated</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => update("accepted")}>Accept</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => update("retired")}>Retire</Button>
        </div>
      )}
    </div>
  );
}

function RiskDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: "", title: "", category: "", likelihood: "medium", impact: "medium",
    owner_label: "", mitigation: "", description: "",
  });
  const save = async () => {
    try {
      await callOp("upsert_risk", form);
      toast.success("Risk saved"); setOpen(false); onSaved();
      setForm({ code: "", title: "", category: "", likelihood: "medium", impact: "medium", owner_label: "", mitigation: "", description: "" });
    } catch (e: any) { toast.error(e.message); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> New risk</Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New risk</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value }))} placeholder="R-01" /></div>
            <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Provider, Data, People…" /></div>
          </div>
          <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} /></div>
          <div className="grid md:grid-cols-3 gap-3">
            <div><Label>Likelihood</Label>
              <select className="w-full border rounded-md h-9 px-2 bg-background" value={form.likelihood} onChange={(e) => setForm(f => ({ ...f, likelihood: e.target.value }))}>
                <option value="low">low</option><option value="medium">medium</option><option value="high">high</option>
              </select>
            </div>
            <div><Label>Impact</Label>
              <select className="w-full border rounded-md h-9 px-2 bg-background" value={form.impact} onChange={(e) => setForm(f => ({ ...f, impact: e.target.value }))}>
                <option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="critical">critical</option>
              </select>
            </div>
            <div><Label>Owner</Label><Input value={form.owner_label} onChange={(e) => setForm(f => ({ ...f, owner_label: e.target.value }))} /></div>
          </div>
          <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div><Label>Mitigation</Label><Textarea rows={2} value={form.mitigation} onChange={(e) => setForm(f => ({ ...f, mitigation: e.target.value }))} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
