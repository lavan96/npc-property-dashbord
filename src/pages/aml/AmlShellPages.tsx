import { AmlShellPage } from "@/components/aml/AmlShellPage";
import { Inbox, Search, ShieldCheck, Gauge, Users, Activity, FileWarning, FileText, Settings2, ClipboardList } from "lucide-react";

export const AmlIntakeQueue = () => (
  <AmlShellPage
    title="Intake Queue"
    description="Newly submitted client onboardings awaiting analyst triage."
    icon={Inbox}
    phaseLabel="Wires in Phase 3 (Client Portal AML Onboarding)"
  />
);

export { default as AmlVerification } from "./AmlVerification";
export { default as AmlScreening } from "./AmlScreening";

export { default as AmlRisk } from "./AmlRisk";

export { default as AmlCounterparty } from "./AmlCounterparty";

export const AmlMonitoring = () => (
  <AmlShellPage
    title="Ongoing Monitoring"
    description="Transactional monitoring, EDD triggers, and existing-client remediation queues."
    icon={Activity}
    phaseLabel="Wires in Phase 9 (Ongoing CDD & Monitoring)"
  />
);

export { default as AmlInvestigations } from "./AmlInvestigations";

export const AmlAustracReporting = () => (
  <AmlShellPage
    title="AUSTRAC Reporting"
    description="SMR, TTR and IFTI drafting, MLRO sign-off, and lodgement history."
    icon={FileText}
    phaseLabel="Wires in Phase 10 (AUSTRAC Reporting Hub)"
  />
);

export const AmlGovernance = () => (
  <AmlShellPage
    title="Governance"
    description="Policy pack versions, MLRO reviews, board reports, and audit chain verification."
    icon={ClipboardList}
    phaseLabel="Wires in Phase 11 (Records, Privacy & Retention)"
  />
);

export const AmlConfiguration = () => (
  <AmlShellPage
    title="Configuration"
    description="Tenant, mandatory controls, risk thresholds, and provider connections."
    icon={Settings2}
    phaseLabel="Wires in Phase 0 tenant surface (Configuration UI in a later phase)"
  />
);
