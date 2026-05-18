import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { MISSION_CONTROL_BILLING_URL } from "@/lib/missionControl";
import { useTokenBalance } from "@/hooks/useTokenBalance";

/**
 * Low-balance warning. Renders only when remaining tokens drop below 10% of allowance.
 * Mount near the top of report-generation pages.
 */
export function TokenBalanceBanner() {
  const { balance, lowBalance } = useTokenBalance();
  if (!lowBalance || !balance) return null;

  const pct = balance.allowance > 0
    ? Math.round((balance.available / balance.allowance) * 100)
    : 0;

  return (
    <Alert className="border-warning bg-warning/10">
      <AlertTriangle className="h-4 w-4 text-warning" />
      <AlertTitle className="text-warning">Token balance low</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">
          {balance.available.toLocaleString()} tokens remaining ({pct}% of allowance).
          Top up to avoid interrupted report generation.
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open(MISSION_CONTROL_BILLING_URL, "_blank", "noopener")}
        >
          Top up
        </Button>
      </AlertDescription>
    </Alert>
  );
}
