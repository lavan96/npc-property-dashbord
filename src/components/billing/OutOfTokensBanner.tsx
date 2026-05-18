import { Ban } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { MISSION_CONTROL_BILLING_URL } from "@/lib/missionControl";

interface OutOfTokensBannerProps {
  available: number;
  requested: number;
  onDismiss?: () => void;
}

/**
 * Dedicated state for `insufficient_funds`. Use after catching `InsufficientTokensError`
 * from a generator call.
 */
export function OutOfTokensBanner({ available, requested, onDismiss }: OutOfTokensBannerProps) {
  return (
    <Alert variant="destructive">
      <Ban className="h-4 w-4" />
      <AlertTitle>Not enough tokens</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>
          This report needs{" "}
          <span className="font-semibold">{requested.toLocaleString()}</span> tokens but only{" "}
          <span className="font-semibold">{available.toLocaleString()}</span> are available
          in your agency pool.
        </span>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.open(MISSION_CONTROL_BILLING_URL, "_blank", "noopener")}
          >
            Top up in Mission Control
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
