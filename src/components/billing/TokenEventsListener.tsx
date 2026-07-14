/**
 * Mount once near the app root. Subscribes to global token events and:
 *  - Renders an OutOfTokens modal dialog when a generator hits insufficient_funds.
 *  - Shows a sonner toast confirming tokens used on successful generation.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { onTokensUsed, onOutOfTokens, type OutOfTokensDetail } from "@/lib/tokenEvents";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  fetchTopupPacks,
  AURIXA_PRICING_URL,
  openMissionControlWithAttribution,
} from "@/lib/missionControl";

const FUNCTION_LABELS: Record<string, string> = {
  "generate-investment-report": "Investment report",
  "generate-bulk-reports": "Bulk reports",
  "generate-market-intelligence-report": "Market intelligence report",
  "generate-portfolio-analysis": "Portfolio analysis",
  "generate-chart-analysis": "Chart analysis",
  "regenerate-report-qualitative": "Report regeneration",
};

export function TokenEventsListener() {
  const [outOfTokens, setOutOfTokens] = useState<OutOfTokensDetail | null>(null);
  const [topupUrl, setTopupUrl] = useState<string>("");

  useEffect(() => {
    const offUsed = onTokensUsed(({ tokensUsed, tokensReserved, estimatedTokens, durationMs, functionName }) => {
      const label = FUNCTION_LABELS[functionName] ?? "Report";
      const parts: string[] = [`Used ${tokensUsed.toLocaleString()} tokens`];
      if (tokensReserved) parts.push(`reserved ${tokensReserved.toLocaleString()}`);
      if (estimatedTokens && estimatedTokens !== tokensReserved) {
        parts.push(`est. ${estimatedTokens.toLocaleString()}`);
      }
      if (durationMs && durationMs > 0) {
        const s = (durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0);
        parts.push(`${s}s`);
      }
      toast.success(`${label} complete`, { description: parts.join(" · ") });
    });
    const offOOT = onOutOfTokens((detail) => {
      setOutOfTokens(detail);
    });
    return () => {
      offUsed();
      offOOT();
    };
  }, []);

  // Lazy-fetch top-up deep link once the modal is triggered.
  useEffect(() => {
    if (!outOfTokens || topupUrl) return;
    let cancelled = false;
    fetchTopupPacks()
      .then((r) => {
        if (!cancelled && r.topupUrl) setTopupUrl(r.topupUrl);
      })
      .catch(() => {/* keep fallback */});
    return () => { cancelled = true; };
  }, [outOfTokens, topupUrl]);

  const open = outOfTokens !== null;
  const available = outOfTokens?.available ?? 0;
  const requested = outOfTokens?.requested ?? 0;
  const short = Math.max(0, requested - available);
  const label = outOfTokens
    ? FUNCTION_LABELS[outOfTokens.functionName] ?? outOfTokens.label ?? "This report"
    : "This report";

  const handleTopUp = () => {
    void openMissionControlWithAttribution("topup", topupUrl || AURIXA_PRICING_URL);
    setOutOfTokens(null);
  };

  const handleUpgrade = () => {
    void openMissionControlWithAttribution("seat_plan", AURIXA_PRICING_URL);
    setOutOfTokens(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setOutOfTokens(null); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-destructive/40 bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center">Out of report credits</DialogTitle>
          <DialogDescription className="text-center">
            {label} needs{" "}
            <span className="font-semibold text-foreground">{requested.toLocaleString()}</span>{" "}
            tokens but only{" "}
            <span className="font-semibold text-foreground">{available.toLocaleString()}</span>{" "}
            are available in your agency pool — you're short by{" "}
            <span className="font-semibold text-foreground">{short.toLocaleString()}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
          Top up your token balance to continue generating this report. New credits are available
          instantly once your purchase completes.
        </div>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => setOutOfTokens(null)}>
            Not now
          </Button>
          <Button variant="outline" onClick={handleUpgrade}>
            Upgrade plan
          </Button>
          <Button onClick={handleTopUp}>Top up credits</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
