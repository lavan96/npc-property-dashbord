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

export { default as AmlFinance } from "./AmlFinance";

export { default as AmlTransactions } from "./AmlTransactions";

export { default as AmlMonitoring } from "./AmlMonitoring";

export { default as AmlInvestigations } from "./AmlInvestigations";

export { default as AmlAustracReporting } from "./AmlAustracReporting";

export { default as AmlRecords } from "./AmlRecords";

export const AmlGovernance = () => (
  <AmlShellPage
    title="Governance"
    description="Policy pack versions, MLRO reviews, board reports, and audit chain verification."
    icon={ClipboardList}
    phaseLabel="Wires in Phase 13 (Security, Resilience & Governance)"
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
