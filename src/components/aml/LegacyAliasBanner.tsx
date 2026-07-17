import { Link } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";

/**
 * Phase 4 legacy alias banner.
 *
 * Rendered at the top of the standalone Verification / Screening / Risk
 * pages to point users at the case-centred workspace. The legacy route
 * itself stays fully functional per Phase 1/4 non-destruction rules.
 */
export function LegacyAliasBanner({ label }: { label: string }) {
  return (
    <Alert className="border-primary/30 bg-primary/5">
      <Info className="h-4 w-4" />
      <AlertTitle>{label} moved into the case workspace</AlertTitle>
      <AlertDescription className="text-xs">
        This page is preserved as a legacy alias. The recommended workflow is to
        open a case from the{" "}
        <Link to="/admin/aml/cases" className="underline font-medium">
          Case register
        </Link>{" "}
        and use the {label} tab there — every action stays scoped to a single
        case_id and hash-chained audit trail.
      </AlertDescription>
    </Alert>
  );
}
