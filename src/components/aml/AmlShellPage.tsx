import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, Sparkles, type LucideIcon } from "lucide-react";
import { ReactNode } from "react";

interface AmlShellPageProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  phaseLabel?: string;
  children?: ReactNode;
}

/**
 * Shared shell for every Phase-2 AML surface. Renders a header, a "coming
 * online in phase N" note, and a slot for placeholder content so the routing
 * and role gating can be exercised end-to-end without live data.
 */
export function AmlShellPage({
  title,
  description,
  icon: Icon = Sparkles,
  phaseLabel = "Data wires in a later phase",
  children,
}: AmlShellPageProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>{phaseLabel}</AlertTitle>
        <AlertDescription>
          The route, permissions, and audit chain for this surface are live. The functional data
          layer ships in a later phase of the AML/CTF plan.
        </AlertDescription>
      </Alert>

      {children ?? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Placeholder workspace</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            No records to display yet. Use the sidebar or sub-navigation to explore other AML
            surfaces.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
