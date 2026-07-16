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

export { default as AmlGovernance } from "./AmlGovernance";


export { default as AmlConfiguration } from "./AmlConfiguration";

