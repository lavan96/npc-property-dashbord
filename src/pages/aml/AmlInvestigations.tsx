import { useEffect, useState } from "react";
import { FileWarning, Loader2, ThumbsUp, ThumbsDown, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { amlRiskApi, type AmlRiskOverride, type AmlApproval } from "@/lib/aml/amlRiskApi";
import { useAmlAccess } from "@/hooks/useAmlAccess";
import { useAmlV3Flags } from "@/lib/aml/useAmlV3Flags";
import { RegulatoryAssuranceHeader } from "@/components/aml/RegulatoryAssuranceHeader";

const STATUS_TONE: Record<string, string> = {
  pending: "bg-warning/15 text-warning",
  approved: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
};

export default function AmlInvestigations() {
  const { roles } = useAmlAccess();
  const canReview = roles.has("reviewer") || roles.has("mlro");
  const { regulatoryHub } = useAmlV3Flags();
  const [tab, setTab] = useState("overrides");
  const [overrides, setOverrides] = useState<AmlRiskOverride[]>([]);
  const [approvals, setApprovals] = useState<AmlApproval[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const [o, a] = await Promise.all([
        amlRiskApi.listOverrides({}),
        amlRiskApi.listApprovals({}),
      ]);
      setOverrides(o.overrides); setApprovals(a.approvals);
    } catch (e: any) { toast.error(e?.message ?? "Failed to load"); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);

  async function resolveOv(id: string, status: "approved" | "rejected") {
    try { await amlRiskApi.resolveOverride(id, status); refresh(); toast.success(`Override ${status}`); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }
  async function resolveAp(id: string, status: "approved" | "rejected") {
    try { await amlRiskApi.resolveApproval(id, status); refresh(); toast.success(`Approval ${status}`); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  return (
    <div className="space-y-6">
      {regulatoryHub && <RegulatoryAssuranceHeader />}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><FileWarning className="h-5 w-5 text-primary" /> Investigations</CardTitle>
            <CardDescription>Risk override requests and senior-authority approvals.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </CardHeader>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overrides">Overrides ({overrides.filter((o) => o.status === "pending").length})</TabsTrigger>
          <TabsTrigger value="approvals">Approvals ({approvals.filter((a) => a.status === "pending").length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overrides">
          <Card>
            <CardContent className="pt-6">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : overrides.length === 0 ? (
                <p className="text-sm text-muted-foreground">No override requests.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Requested</TableHead>
                      <TableHead>Case</TableHead>
                      <TableHead>Requested rating</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overrides.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="text-xs">{new Date(o.created_at).toLocaleString()}</TableCell>
                        <TableCell className="font-mono text-xs">{o.case_id.slice(0, 8)}…</TableCell>
                        <TableCell>{o.requested_rating || "—"}</TableCell>
                        <TableCell className="max-w-md text-sm text-muted-foreground">{o.requested_reason}</TableCell>
                        <TableCell><Badge className={STATUS_TONE[o.status]}>{o.status}</Badge></TableCell>
                        <TableCell className="text-right">
                          {o.status === "pending" && canReview && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => resolveOv(o.id, "approved")}><ThumbsUp className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => resolveOv(o.id, "rejected")}><ThumbsDown className="h-4 w-4" /></Button>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approvals">
          <Card>
            <CardContent className="pt-6">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : approvals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending approvals.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Requested</TableHead>
                      <TableHead>Case</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {approvals.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs">{new Date(a.requested_at).toLocaleString()}</TableCell>
                        <TableCell className="font-mono text-xs">{a.case_id.slice(0, 8)}…</TableCell>
                        <TableCell>{a.kind}</TableCell>
                        <TableCell><Badge className={STATUS_TONE[a.status]}>{a.status}</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{a.note || "—"}</TableCell>
                        <TableCell className="text-right">
                          {a.status === "pending" && canReview && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => resolveAp(a.id, "approved")}><ThumbsUp className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => resolveAp(a.id, "rejected")}><ThumbsDown className="h-4 w-4" /></Button>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
