import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Gauge, ShieldCheck, Users, Info } from "lucide-react";
import { amlCasesApi, type AmlCase } from "@/lib/aml/amlCasesApi";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function AmlOverview() {
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<AmlCase[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await amlCasesApi.list({ limit: 5 });
        if (!alive) return;
        setCases(res.cases ?? []);
        setTotal(res.total ?? 0);
      } catch (e: any) {
        if (alive) setError(e?.message ?? "Unable to load cases");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const openCount = cases.filter((c) => !["cleared", "closed", "blocked"].includes(c.status)).length;
  const escalated = cases.filter((c) => c.status === "escalated_mlro").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Total cases</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-semibold">{total}</div>}
            <p className="mt-1 text-xs text-muted-foreground">Across all statuses in this tenant.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Open (recent)</CardTitle>
            <Gauge className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-semibold">{openCount}</div>}
            <p className="mt-1 text-xs text-muted-foreground">Of the latest {cases.length} cases, still under investigation.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Escalated → MLRO</CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-semibold">{escalated}</div>}
            <p className="mt-1 text-xs text-muted-foreground">Awaiting MLRO decision.</p>
          </CardContent>
        </Card>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load cases</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Phase 2 — Module shell</AlertTitle>
        <AlertDescription>
          The AML sidebar, role gating, and step-up auth for restricted routes are now live.
          Screening, verification, monitoring, AUSTRAC reporting and configuration surfaces
          come online in later phases.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Latest cases</CardTitle>
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/aml/cases">Open case register →</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : cases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cases yet. Create one from the Customer Cases tab.</p>
          ) : (
            <ul className="divide-y divide-border/60 text-sm">
              {cases.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{c.subject_display_name}</div>
                    <div className="text-xs text-muted-foreground">{c.case_reference}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.risk_rating && <Badge variant="outline" className="capitalize">{c.risk_rating}</Badge>}
                    <Badge variant="secondary" className="capitalize">{c.status.replace(/_/g, " ")}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
