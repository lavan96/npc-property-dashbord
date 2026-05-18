import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  MISSION_CONTROL_BILLING_URL,
  MISSION_CONTROL_TOPUP_URL,
  fetchTopupPacks,
} from "@/lib/missionControl";

interface OutOfTokensBannerProps {
  available: number;
  requested: number;
  onDismiss?: () => void;
}

/**
 * Dedicated state for `insufficient_funds`. Use after catching `InsufficientTokensError`
 * from a generator call. Lazy-fetches the Mission Control top-up deep link so the CTA
 * routes the operator straight to the hosted top-up page.
 */
export function OutOfTokensBanner({ available, requested, onDismiss }: OutOfTokensBannerProps) {
  const short = Math.max(0, requested - available);
  const [topupUrl, setTopupUrl] = useState<string>(MISSION_CONTROL_TOPUP_URL);

  useEffect(() => {
    let cancelled = false;
    fetchTopupPacks()
      .then((r) => {
        if (!cancelled && r.topupUrl) setTopupUrl(r.topupUrl);
      })
      .catch(() => {/* keep fallback URL */});
    return () => { cancelled = true; };
  }, []);

  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Out of report credits</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>
          This report needs{" "}
          <span className="font-semibold">{requested.toLocaleString()}</span> tokens but only{" "}
          <span className="font-semibold">{available.toLocaleString()}</span> are available in your
          agency pool — you're short by{" "}
          <span className="font-semibold">{short.toLocaleString()}</span>.
        </span>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => window.open(topupUrl, "_blank", "noopener,noreferrer")}
          >
            Top up credits
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(MISSION_CONTROL_BILLING_URL, "_blank", "noopener,noreferrer")}
          >
            Upgrade plan
          </Button>
          {onDismiss && (
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
