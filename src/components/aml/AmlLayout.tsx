import { NavLink, Outlet, useLocation } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAmlAccess } from "@/hooks/useAmlAccess";
import { hasAmlCapability, type AmlCapability } from "@/lib/aml/permissions";
import { Badge } from "@/components/ui/badge";

interface AmlTab {
  label: string;
  to: string;
  end?: boolean;
  capability: AmlCapability;
  restrictedNote?: string;
}

const TABS: AmlTab[] = [
  { label: "Overview", to: "/admin/aml", end: true, capability: "aml.view" },
  { label: "Intake Queue", to: "/admin/aml/intake", capability: "aml.view" },
  { label: "Customer Cases", to: "/admin/aml/cases", capability: "aml.view" },
  { label: "Verification", to: "/admin/aml/verification", capability: "aml.view" },
  { label: "Screening", to: "/admin/aml/screening", capability: "aml.view" },
  { label: "Risk", to: "/admin/aml/risk", capability: "aml.view" },
  { label: "Counterparty", to: "/admin/aml/counterparty", capability: "aml.view" },
  { label: "Monitoring", to: "/admin/aml/monitoring", capability: "aml.view" },
  { label: "Investigations", to: "/admin/aml/investigations", capability: "aml.investigate", restrictedNote: "Analyst+" },
  { label: "AUSTRAC Reporting", to: "/admin/aml/austrac", capability: "aml.report", restrictedNote: "MLRO" },
  { label: "Governance", to: "/admin/aml/governance", capability: "aml.view" },
  { label: "Configuration", to: "/admin/aml/configuration", capability: "aml.configure", restrictedNote: "MLRO" },
];

export function AmlLayout() {
  const { roles, flagEnabled } = useAmlAccess();
  const location = useLocation();

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border/60 bg-card/60 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-6 pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold tracking-tight">AML/CTF Compliance</h1>
              <p className="text-xs text-muted-foreground">
                Tri-portal command centre for AUSTRAC-aligned KYC, screening, monitoring and reporting.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {flagEnabled ? (
                <Badge variant="outline" className="border-success/40 text-success">Module enabled</Badge>
              ) : (
                <Badge variant="outline" className="border-yellow-500/40 text-yellow-500">Module disabled</Badge>
              )}
              {Array.from(roles).sort().map((r) => (
                <Badge key={r} variant="secondary" className="capitalize">{r}</Badge>
              ))}
            </div>
          </div>

          <nav
            aria-label="AML sub-navigation"
            className="-mx-2 flex gap-1 overflow-x-auto pb-2 pt-1"
          >
            {TABS.map((tab) => {
              const allowed = hasAmlCapability(roles, tab.capability);
              const active = tab.end
                ? location.pathname === tab.to
                : location.pathname === tab.to || location.pathname.startsWith(tab.to + "/");
              return (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end={tab.end}
                  className={cn(
                    "group inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    !allowed && "opacity-50",
                  )}
                  aria-current={active ? "page" : undefined}
                  title={!allowed ? "You do not have permission for this surface" : tab.label}
                >
                  <span>{tab.label}</span>
                  {tab.restrictedNote && (
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
                        active
                          ? "border-primary/40 text-primary"
                          : "border-border/60 text-muted-foreground",
                      )}
                    >
                      {tab.restrictedNote}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-6">
        <Outlet />
      </div>
    </div>
  );
}
