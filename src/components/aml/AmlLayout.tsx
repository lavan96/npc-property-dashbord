import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo } from "react";
import {
  ShieldCheck,
  Home,
  Users,
  Coins,
  Gavel,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAmlAccess } from "@/hooks/useAmlAccess";
import { hasAmlCapability, type AmlCapability } from "@/lib/aml/permissions";
import { useAmlTerminology } from "@/lib/aml/useAmlTerminology";

/**
 * Phase 1 — Five-Workspace Navigation Shell.
 *
 * Replaces the previous 16-tab horizontal-scroll sub-nav with the five
 * role-adaptive workspaces defined in the Version 2 Implementation Report:
 *
 *   Compliance Home · Customer Compliance · Transaction Compliance ·
 *   Regulatory & Assurance · Platform Administration
 *
 * Legacy `/admin/aml/*` routes remain wired in `src/App.tsx` and continue to
 * resolve unchanged — this shell simply groups them beneath the appropriate
 * workspace and exposes a workspace-local secondary nav. `AmlGuard` performs
 * the server-side permission check on every underlying route, so the shell
 * only decides visibility of the top-level entries.
 */

interface SecondaryEntry {
  label: string;
  to: string;
  end?: boolean;
  capability: AmlCapability;
}

interface Workspace {
  key: string;
  label: string;
  icon: LucideIcon;
  /** All URLs that should activate this workspace tab. */
  paths: string[];
  /** Where the workspace tab lands when clicked. */
  defaultPath: string;
  /** Minimum capability to see the workspace at all. */
  minCapability: AmlCapability;
  /** Workspace-local secondary navigation (case tabs / sub-sections). */
  secondary?: SecondaryEntry[];
}

const WORKSPACES: Workspace[] = [
  {
    key: "home",
    label: "Compliance Home",
    icon: Home,
    paths: ["/admin/aml"],
    defaultPath: "/admin/aml",
    minCapability: "aml.view",
  },
  {
    key: "customer",
    label: "Customer Compliance",
    icon: Users,
    paths: [
      "/admin/aml/cases",
      "/admin/aml/intake",
      "/admin/aml/verification",
      "/admin/aml/screening",
      "/admin/aml/risk",
      "/admin/aml/counterparty",
      "/admin/aml/finance",
    ],
    defaultPath: "/admin/aml/cases",
    minCapability: "aml.view",
    secondary: [
      { label: "Register", to: "/admin/aml/cases", capability: "aml.view" },
      { label: "Intake Queue", to: "/admin/aml/intake", capability: "aml.view" },
      { label: "Verification", to: "/admin/aml/verification", capability: "aml.view" },
      { label: "Screening", to: "/admin/aml/screening", capability: "aml.view" },
      { label: "Risk", to: "/admin/aml/risk", capability: "aml.view" },
      { label: "Structures", to: "/admin/aml/counterparty", capability: "aml.view" },
      { label: "Finance handoff", to: "/admin/aml/finance", capability: "aml.investigate" },
    ],
  },
  {
    key: "transactions",
    label: "Transaction Compliance",
    icon: Coins,
    paths: ["/admin/aml/transactions"],
    defaultPath: "/admin/aml/transactions",
    minCapability: "aml.investigate",
    secondary: [
      { label: "Transactions", to: "/admin/aml/transactions", capability: "aml.investigate" },
    ],
  },
  {
    key: "regulatory",
    label: "Regulatory & Assurance",
    icon: Gavel,
    paths: [
      "/admin/aml/monitoring",
      "/admin/aml/investigations",
      "/admin/aml/austrac",
      "/admin/aml/records",
      "/admin/aml/governance",
    ],
    defaultPath: "/admin/aml/monitoring",
    minCapability: "aml.view",
    secondary: [
      { label: "Monitoring", to: "/admin/aml/monitoring", capability: "aml.view" },
      { label: "Investigations & EDD", to: "/admin/aml/investigations", capability: "aml.investigate" },
      { label: "AUSTRAC Hub", to: "/admin/aml/austrac", capability: "aml.report" },
      { label: "Records & Privacy", to: "/admin/aml/records", capability: "aml.view" },
      { label: "Governance", to: "/admin/aml/governance", capability: "aml.view" },
    ],
  },
  {
    key: "admin",
    label: "Platform Administration",
    icon: Settings2,
    paths: ["/admin/aml/launch-ops", "/admin/aml/configuration"],
    defaultPath: "/admin/aml/launch-ops",
    minCapability: "aml.view",
    secondary: [
      { label: "Launch Ops", to: "/admin/aml/launch-ops", capability: "aml.view" },
      { label: "Configuration", to: "/admin/aml/configuration", capability: "aml.configure" },
    ],
  },
];

function pathMatchesWorkspace(pathname: string, workspace: Workspace): boolean {
  // Compliance Home matches only the exact root — every other path belongs to
  // the workspace whose `paths` list contains a matching prefix.
  if (workspace.key === "home") return pathname === "/admin/aml";
  return workspace.paths.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export function AmlLayout() {
  const { roles, loading } = useAmlAccess();
  const { t } = useAmlTerminology();
  const location = useLocation();
  const navigate = useNavigate();

  // Only show workspaces the user has *any* legitimate reason to enter.
  // Server-side permission enforcement continues to happen inside each route
  // via `AmlGuard`; this filter simply hides unreachable entries.
  const visibleWorkspaces = useMemo(() => {
    if (loading) return WORKSPACES;
    return WORKSPACES.filter((w) => {
      if (!hasAmlCapability(roles, w.minCapability)) return false;
      if (!w.secondary || w.secondary.length === 0) return true;
      // Show the workspace if at least one secondary entry is permitted.
      return w.secondary.some((s) => hasAmlCapability(roles, s.capability));
    });
  }, [roles, loading]);

  const activeWorkspace =
    visibleWorkspaces.find((w) => pathMatchesWorkspace(location.pathname, w)) ??
    visibleWorkspaces[0];

  // If a user lands on a legacy URL they cannot access (permissions changed),
  // AmlGuard will already show the denial page — nothing to do here.

  // Route legacy `/admin/aml/intake` onward remains untouched. All legacy URLs
  // continue to resolve because the underlying routes in `src/App.tsx` are
  // preserved. This shell only changes the visual navigation grouping.

  // Auto-redirect: if the user lands on the module root but their default
  // landing role is not Compliance Home (Phase 2 will refine this per-role),
  // we still deliver them to `/admin/aml` for now — no forced redirect.
  useEffect(() => {
    // Reserved for Phase 2 role-based default landing.
  }, [navigate]);

  const secondary = activeWorkspace?.secondary?.filter((s) =>
    hasAmlCapability(roles, s.capability),
  );

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border/60 bg-card/60 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-6 pt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold tracking-tight">{t("AML/CTF Compliance")}</h1>
              <p className="text-xs text-muted-foreground">
                {t("Case-centred workspace for AUSTRAC-aligned KYC, screening, monitoring and reporting.")}
              </p>
            </div>
            {/* Role chips + module status intentionally removed per Version 2 spec.
                Restricted capability is signalled where useful in secondary nav. */}
          </div>

          {/* Primary — five role-adaptive workspaces, no horizontal scroll. */}
          <nav
            aria-label="AML workspaces"
            className="flex w-full flex-wrap gap-1 border-b border-border/40"
          >
            {visibleWorkspaces.map((w) => {
              const active = activeWorkspace?.key === w.key;
              const Icon = w.icon;
              return (
                <NavLink
                  key={w.key}
                  to={w.defaultPath}
                  className={cn(
                    "inline-flex min-w-0 items-center gap-2 rounded-t-md border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{t(w.label)}</span>
                </NavLink>
              );
            })}
          </nav>

          {/* Secondary — workspace-local sections. Rendered only when the
              active workspace publishes secondary entries. */}
          {secondary && secondary.length > 0 && (
            <nav
              aria-label={`${activeWorkspace?.label} sections`}
              className="flex flex-wrap gap-1 pb-3"
            >
              {secondary.map((s) => {
                const active =
                  location.pathname === s.to ||
                  location.pathname.startsWith(s.to + "/");
                return (
                  <NavLink
                    key={s.to}
                    to={s.to}
                    end={s.end}
                    className={cn(
                      "inline-flex shrink-0 items-center rounded-md px-3 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    {t(s.label)}
                  </NavLink>
                );
              })}
            </nav>
          )}
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-6">
        <Outlet />
      </div>
    </div>
  );
}
