/**
 * Mount once near the app root. Subscribes to global token events and:
 *  - Renders an OutOfTokensBanner overlay when a generator hits insufficient_funds.
 *  - Shows a sonner toast confirming tokens used on successful generation.
 *
 * Keeps callers free of token-handling boilerplate.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { onTokensUsed, onOutOfTokens, type OutOfTokensDetail } from "@/lib/tokenEvents";
import { OutOfTokensBanner } from "@/components/billing/OutOfTokensBanner";

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

  useEffect(() => {
    const offUsed = onTokensUsed(({ tokensUsed, tokensReserved, functionName }) => {
      const label = FUNCTION_LABELS[functionName] ?? "Report";
      toast.success(`${label} complete`, {
        description: `Used ${tokensUsed.toLocaleString()} tokens${
          tokensReserved ? ` (reserved ${tokensReserved.toLocaleString()})` : ""
        }`,
      });
    });
    const offOOT = onOutOfTokens((detail) => {
      setOutOfTokens(detail);
    });
    return () => {
      offUsed();
      offOOT();
    };
  }, []);

  if (!outOfTokens) return null;

  return (
    <div className="fixed inset-x-0 top-4 z-[100] mx-auto w-[min(640px,calc(100vw-2rem))] px-2">
      <OutOfTokensBanner
        available={outOfTokens.available}
        requested={outOfTokens.requested}
        onDismiss={() => setOutOfTokens(null)}
      />
    </div>
  );
}
