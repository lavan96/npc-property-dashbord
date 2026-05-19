import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Coins, ArrowLeft, ExternalLink } from "lucide-react";
import { TokenBalancePill } from "@/components/billing/TokenBalancePill";
import { TokenBalanceBanner } from "@/components/billing/TokenBalanceBanner";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { MISSION_CONTROL_TOPUP_URL } from "@/lib/missionControl";

export default function BillingTopup() {
  const navigate = useNavigate();
  const { balance } = useTokenBalance();

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Top up credits</h1>
        <div className="ml-auto">
          <TokenBalancePill />
        </div>
      </div>

      <TokenBalanceBanner />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" />
            Credit top-up
          </CardTitle>
          <CardDescription>
            Add report credits to your agency pool. All billing is managed through Aurixa Mission Control.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-4 text-sm">
            <p className="font-medium">Current balance</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {balance?.available?.toLocaleString() ?? "—"} tokens
            </p>
            <p className="text-muted-foreground">
              of {balance?.allowance?.toLocaleString() ?? "—"} allowance
              {balance?.planName ? ` · ${balance.planName}` : ""}
            </p>
          </div>

          <Button
            onClick={() =>
              window.open(MISSION_CONTROL_TOPUP_URL, "_blank", "noopener,noreferrer")
            }
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Open Mission Control top-up
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
