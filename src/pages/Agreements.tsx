import { useState } from "react";
import {
  useAgencyAgreements,
  useAgreementMutations,
  AgencyAgreement,
} from "@/hooks/useAgencyAgreements";
import { CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FlattenPdfMenuItem } from "@/components/common/FlattenPdfMenuItem";
import { fetchPdfBlob } from "@/lib/pdf/downloadPdf";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileSignature,
  Search,
  RefreshCw,
  MoreHorizontal,
  Eye,
  XCircle,
  Download,
  Loader2,
  Send,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Ban,
  FileText,
  Mail,
  CalendarDays,
  FileCheck2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { invokeSecureFunction } from "@/lib/secureInvoke";
import GammaTemplateManager from "@/components/agreements/GammaTemplateManager";
import {
  PrepareForSigningModal,
  type SigningRecipient,
} from "@/components/agreements/PrepareForSigningModal";
import {
  EnvelopeStatusDialog,
  DocuSignStatusBadge,
} from "@/components/agreements/EnvelopeStatusDialog";
import { supabase } from "@/integrations/supabase/client";
import { DashboardThemeFrame } from "@/components/layout/DashboardThemeFrame";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    variant:
      | "default"
      | "secondary"
      | "destructive"
      | "outline"
      | "success"
      | "warning";
    icon: React.ComponentType<any>;
    toneClassName: string;
  }
> = {
  pending_pdf: {
    label: "Processing PDF",
    variant: "warning",
    icon: Clock,
    toneClassName:
      "border-amber-300/45 bg-amber-500/12 text-amber-800 dark:border-amber-200/30 dark:bg-amber-300/12 dark:text-amber-100",
  },
  generating: {
    label: "Generating",
    variant: "warning",
    icon: Loader2,
    toneClassName:
      "border-amber-300/45 bg-amber-500/12 text-amber-800 dark:border-amber-200/30 dark:bg-amber-300/12 dark:text-amber-100",
  },
  generated: {
    label: "Generated",
    variant: "outline",
    icon: FileSignature,
    toneClassName:
      "border-slate-300/70 bg-slate-100/80 text-slate-700 dark:border-slate-600/70 dark:bg-slate-800/70 dark:text-slate-200",
  },
  draft: {
    label: "Draft",
    variant: "outline",
    icon: FileText,
    toneClassName:
      "border-slate-300/70 bg-slate-100/80 text-slate-700 dark:border-slate-600/70 dark:bg-slate-800/70 dark:text-slate-200",
  },
  sent: {
    label: "Sent",
    variant: "default",
    icon: Send,
    toneClassName:
      "border-amber-300/55 bg-amber-500/14 text-amber-900 dark:border-amber-200/35 dark:bg-amber-300/14 dark:text-amber-100",
  },
  delivered: {
    label: "Delivered",
    variant: "default",
    icon: CheckCircle2,
    toneClassName:
      "border-amber-300/55 bg-amber-500/14 text-amber-900 dark:border-amber-200/35 dark:bg-amber-300/14 dark:text-amber-100",
  },
  viewed: {
    label: "Viewed",
    variant: "default",
    icon: Eye,
    toneClassName:
      "border-amber-300/55 bg-amber-500/14 text-amber-900 dark:border-amber-200/35 dark:bg-amber-300/14 dark:text-amber-100",
  },
  signed: {
    label: "Signed",
    variant: "success",
    icon: CheckCircle2,
    toneClassName:
      "border-emerald-300/55 bg-emerald-500/12 text-emerald-800 dark:border-emerald-200/35 dark:bg-emerald-300/12 dark:text-emerald-100",
  },
  completed: {
    label: "Completed",
    variant: "success",
    icon: CheckCircle2,
    toneClassName:
      "border-teal-300/55 bg-teal-500/12 text-teal-800 dark:border-teal-200/35 dark:bg-teal-300/12 dark:text-teal-100",
  },
  declined: {
    label: "Declined",
    variant: "destructive",
    icon: AlertTriangle,
    toneClassName:
      "border-red-300/60 bg-red-500/12 text-red-800 dark:border-red-300/35 dark:bg-red-400/12 dark:text-red-100",
  },
  voided: {
    label: "Voided",
    variant: "destructive",
    icon: Ban,
    toneClassName:
      "border-red-300/60 bg-red-500/12 text-red-800 dark:border-red-300/35 dark:bg-red-400/12 dark:text-red-100",
  },
  expired: {
    label: "Expired",
    variant: "secondary",
    icon: Clock,
    toneClassName:
      "border-red-300/60 bg-red-500/12 text-red-800 dark:border-red-300/35 dark:bg-red-400/12 dark:text-red-100",
  },
  failed: {
    label: "Failed",
    variant: "destructive",
    icon: AlertTriangle,
    toneClassName:
      "border-red-300/60 bg-red-500/12 text-red-800 dark:border-red-300/35 dark:bg-red-400/12 dark:text-red-100",
  },
};

export default function Agreements() {
  const { data: agreements = [], isLoading } = useAgencyAgreements();
  const { checkStatus, voidAgreement, sendViaDocuSign, retryPdf } =
    useAgreementMutations();
  const [searchTerm, setSearchTerm] = useState("");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [signingAgreement, setSigningAgreement] =
    useState<AgencyAgreement | null>(null);
  const [signingPdfUrl, setSigningPdfUrl] = useState<string>("");
  const [statusAgreement, setStatusAgreement] =
    useState<AgencyAgreement | null>(null);
  const navigate = useNavigate();
  const { canEdit: canEditAgreements } = useModulePermissions("agreements");

  const openPrepareForSigning = async (a: AgencyAgreement) => {
    if (!a.pdf_storage_path) {
      toast.error("PDF not ready yet");
      return;
    }
    const { data, error } = await supabase.storage
      .from("agency-agreements")
      .createSignedUrl(a.pdf_storage_path, 600);
    if (error || !data?.signedUrl) {
      toast.error(`Failed to load PDF: ${error?.message}`);
      return;
    }
    const existingRecipients: SigningRecipient[] =
      Array.isArray((a as any).signing_recipients) &&
      (a as any).signing_recipients.length
        ? (a as any).signing_recipients
        : [
            {
              id: "buyer",
              name: a.buyer_names,
              email: a.buyer_email || "",
              roleLabel: "Primary Buyer",
              routingOrder: 1,
            },
            ...(a.secondary_buyer_name
              ? [
                  {
                    id: "buyer2",
                    name: a.secondary_buyer_name,
                    email:
                      (a as any).secondary_buyer_email || a.buyer_email || "",
                    roleLabel: "Secondary Buyer",
                    routingOrder: 1,
                  },
                ]
              : []),
          ];
    setSigningPdfUrl(data.signedUrl);
    setSigningAgreement({
      ...a,
      signing_recipients: existingRecipients,
    } as any);
  };

  const filteredAgreements = agreements.filter(
    (a) =>
      a.buyer_names.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.buyer_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.status.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const totalSent = agreements.filter((a) =>
    ["sent", "delivered", "viewed", "signed"].includes(a.status),
  ).length;
  const totalSigned = agreements.filter((a) => a.status === "signed").length;
  const pending = agreements.filter((a) =>
    ["sent", "delivered", "viewed"].includes(a.status),
  ).length;

  const fetchAgreementPreview = async (
    agreementId: string,
  ): Promise<{ html: string | null; pdf_url: string | null }> => {
    const { data, error } = await invokeSecureFunction<{
      html: string;
      pdf_url?: string;
      gamma_url?: string;
    }>("manage-agency-agreements", {
      action: "preview",
      agreement_id: agreementId,
    });
    if (error || !data) {
      toast.error(
        "Failed to load agreement: " + (error?.message || "Unknown error"),
      );
      return { html: null, pdf_url: null };
    }
    return { html: data.html || null, pdf_url: data.pdf_url || null };
  };

  const handleViewAgreement = async (agreement: AgencyAgreement) => {
    setIsPreviewLoading(true);
    setPreviewTitle(`Agreement — ${agreement.buyer_names}`);
    setPreviewHtml(null);
    const { html, pdf_url } = await fetchAgreementPreview(agreement.id);
    if (pdf_url) {
      // Show PDF in iframe
      setPreviewHtml(`__PDF__${pdf_url}`);
    } else if (html) {
      setPreviewHtml(html);
    } else {
      setPreviewTitle("");
    }
    setIsPreviewLoading(false);
  };

  const handleDownloadAgreement = async (agreement: AgencyAgreement) => {
    toast.loading("Preparing download...", { id: "download-agreement" });
    let { html, pdf_url } = await fetchAgreementPreview(agreement.id);

    // If no PDF, attempt a retry (deferred generation may have completed)
    if (!pdf_url && !agreement.pdf_storage_path) {
      toast.loading("PDF not ready yet, retrying...", {
        id: "download-agreement",
      });
      try {
        const retryResult = await retryPdf.mutateAsync(agreement.id);
        if (retryResult?.pdf_url) {
          pdf_url = retryResult.pdf_url;
        }
      } catch {
        // Retry failed, will fall back to HTML
      }
    }

    if (pdf_url) {
      try {
        const res = await fetch(pdf_url);
        if (!res.ok) throw new Error("Failed to fetch PDF");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `Agreement_${agreement.buyer_names.replace(/\s+/g, "_")}_${format(new Date(agreement.agreement_date), "yyyy-MM-dd")}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success("PDF downloaded", { id: "download-agreement" });
      } catch {
        toast.error("Failed to download PDF", { id: "download-agreement" });
      }
      return;
    }

    if (!html) {
      toast.error(
        "Agreement PDF is still being generated. Please try again in a minute.",
        { id: "download-agreement" },
      );
      return;
    }
    // Fallback: Download as HTML file
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Agreement_${agreement.buyer_names.replace(/\s+/g, "_")}_${format(new Date(agreement.agreement_date), "yyyy-MM-dd")}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Agreement downloaded (HTML fallback)", {
      id: "download-agreement",
    });
  };

  const handleRefreshStatus = async (id: string) => {
    try {
      await checkStatus.mutateAsync(id);
      toast.success("Status refreshed");
    } catch {
      // handled by mutation
    }
  };

  const handleVoid = async (id: string) => {
    const reason = prompt("Reason for voiding this agreement:");
    if (!reason) return;
    await voidAgreement.mutateAsync({ agreementId: id, reason });
  };

  const handleViewClient = (clientId: string) => {
    navigate(`/clients?clientId=${clientId}`);
  };

  const handleSendViaDocuSign = async (agreement: AgencyAgreement) => {
    if (!confirm(`Send agreement for ${agreement.buyer_names} via DocuSign?`))
      return;
    try {
      await sendViaDocuSign.mutateAsync(agreement.id);
    } catch {
      // handled by mutation
    }
  };

  const renderStatusBadge = (status: string) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.generated;
    const Icon = config.icon;
    return (
      <Badge
        variant={config.variant}
        className={cn(
          "max-w-full justify-start gap-1.5 rounded-full border px-2.5 py-1 text-[0.68rem] font-bold uppercase leading-4 tracking-[0.075em] shadow-sm backdrop-blur transition-colors",
          config.toneClassName,
        )}
      >
        <Icon className="h-3 w-3 shrink-0" />
        <span className="min-w-0 truncate">{config.label}</span>
      </Badge>
    );
  };


  const renderDocuSignTimelineDate = (
    label: string,
    date: string | null | undefined,
    emptyLabel: string,
    Icon: React.ComponentType<any>,
  ) => (
    <div className="flex min-w-[8.75rem] items-center gap-2 rounded-xl border border-border/60 bg-background/70 px-2.5 py-2 shadow-sm dark:bg-slate-950/35">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[0.62rem] font-bold uppercase leading-3 tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "block whitespace-nowrap text-sm font-semibold leading-5",
            date ? "text-foreground" : "text-muted-foreground/70",
          )}
        >
          {date ? format(new Date(date), "dd MMM yyyy") : emptyLabel}
        </span>
      </span>
    </div>
  );

  const getDocuSignTrackingTone = (status?: string | null) => {
    const key = status?.toLowerCase();
    if (["completed", "signed"].includes(key || "")) {
      return "border-emerald-300/60 bg-emerald-500/[0.08] shadow-emerald-900/5 dark:border-emerald-300/30 dark:bg-emerald-400/[0.10]";
    }
    if (["sent", "delivered", "viewed"].includes(key || "")) {
      return "border-amber-300/70 bg-amber-500/[0.10] shadow-amber-900/5 ring-1 ring-amber-300/20 dark:border-amber-200/35 dark:bg-amber-300/[0.10] dark:ring-amber-200/10";
    }
    if (["declined", "voided", "expired", "failed"].includes(key || "")) {
      return "border-red-300/55 bg-red-500/[0.07] shadow-red-900/5 dark:border-red-300/30 dark:bg-red-400/[0.08]";
    }
    return "border-border/60 bg-background/60 dark:bg-slate-950/30";
  };

  const renderDocuSignTracking = (agreement: AgencyAgreement) => {
    const hasEnvelope = Boolean(agreement.docusign_envelope_id);

    if (!hasEnvelope || !agreement.docusign_status) {
      return (
        <div className="flex max-w-[18rem] flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {renderStatusBadge(agreement.status)}
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-dashed border-border/70 bg-muted/35 px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.075em] text-muted-foreground/75 dark:bg-slate-900/35">
            <Mail className="h-3 w-3" />
            Not sent
          </span>
        </div>
      );
    }

    return (
      <div
        className={cn(
          "max-w-[20rem] rounded-2xl border p-2.5 shadow-sm transition-all group-hover:-translate-y-0.5 group-hover:shadow-md",
          getDocuSignTrackingTone(agreement.docusign_status),
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {renderStatusBadge(agreement.status)}
            <DocuSignStatusBadge status={agreement.docusign_status} />
          </div>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-background/80 text-primary ring-1 ring-border/60 dark:bg-slate-950/55">
            <FileSignature className="h-4 w-4" />
          </span>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:hidden xl:grid">
          {renderDocuSignTimelineDate("Sent", agreement.docusign_sent_at, "Not sent", CalendarDays)}
          {renderDocuSignTimelineDate("Signed", agreement.docusign_signed_at, "Pending", FileCheck2)}
        </div>
      </div>
    );
  };

  const renderAgreementDate = (date: string) => (
    <span className="inline-flex min-w-[7.25rem] items-center justify-center rounded-xl border border-border/55 bg-background/65 px-2.5 py-1.5 text-sm font-semibold text-foreground shadow-sm dark:bg-slate-950/35">
      {format(new Date(date), "dd MMM yyyy")}
    </span>
  );

  return (
    <DashboardThemeFrame
      as="main"
      variant="page"
      className="space-y-7 px-3 py-4 text-foreground sm:px-6 sm:py-7 lg:px-8"
    >
      <DashboardThemeFrame
        as="header"
        variant="hero"
        className="isolate flex flex-col gap-6 overflow-hidden border-primary/20 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.18),transparent_34%),radial-gradient(circle_at_14%_12%,hsl(43_84%_52%/0.18),transparent_28%),linear-gradient(135deg,hsl(var(--card)/0.98),hsl(var(--background)/0.9)_52%,hsl(var(--muted)/0.45))] py-7 shadow-[0_24px_70px_rgba(15,23,42,0.11)] shadow-primary/5 before:absolute before:inset-x-8 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-amber-300/70 before:to-transparent dark:bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.20),transparent_36%),radial-gradient(circle_at_14%_12%,hsl(43_84%_52%/0.14),transparent_30%),linear-gradient(135deg,hsl(var(--card)/0.88),hsl(var(--background)/0.76)_52%,hsl(var(--muted)/0.18))] sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-4">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.35rem] border border-amber-300/40 bg-[linear-gradient(135deg,hsl(43_84%_52%/0.20),hsl(var(--primary)/0.14))] text-primary shadow-[inset_0_1px_0_hsl(0_0%_100%/0.35),0_16px_36px_hsl(43_74%_28%/0.16)] dark:border-amber-200/25 dark:bg-[linear-gradient(135deg,hsl(43_84%_52%/0.16),hsl(var(--primary)/0.16))]">
            <span className="absolute inset-2 rounded-2xl border border-white/30 dark:border-white/10" />
            <FileSignature className="relative h-7 w-7 drop-shadow-sm" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700 dark:text-amber-200">
              DocuSign workflow
            </p>
            <h1 className="text-2xl font-semibold tracking-[-0.035em] text-foreground sm:text-4xl">
              Agency Agreements
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Manage and track Buyer's Agent Agreements sent via DocuSign
            </p>
          </div>
        </div>
        <div className="rounded-full border border-amber-300/40 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-800 shadow-sm shadow-amber-950/5 dark:border-amber-200/25 dark:bg-amber-300/10 dark:text-amber-100">
          {pending} awaiting signature
        </div>
      </DashboardThemeFrame>

      <section
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Agreement KPI summary"
      >
        {[
          {
            label: "Total Agreements",
            value: agreements.length,
            Icon: FileText,
            className:
              "border-primary/25 bg-[radial-gradient(circle_at_18%_0%,hsl(var(--primary)/0.18),transparent_38%),linear-gradient(145deg,hsl(var(--card)/0.98),hsl(var(--background)/0.82))] dark:border-primary/30 dark:bg-[radial-gradient(circle_at_18%_0%,hsl(var(--primary)/0.20),transparent_40%),linear-gradient(145deg,hsl(var(--card)/0.82),hsl(var(--background)/0.56))]",
            iconClassName:
              "border-primary/30 bg-primary/12 text-primary shadow-primary/20",
            valueClassName: "text-primary",
            railClassName: "from-primary/75 via-amber-300/70 to-primary/15",
          },
          {
            label: "Sent",
            value: totalSent,
            Icon: Send,
            className:
              "border-amber-400/25 bg-[radial-gradient(circle_at_18%_0%,hsl(38_92%_52%/0.16),transparent_38%),linear-gradient(145deg,hsl(var(--card)/0.97),hsl(var(--background)/0.80))] dark:border-amber-300/25 dark:bg-[radial-gradient(circle_at_18%_0%,hsl(38_92%_52%/0.18),transparent_40%),linear-gradient(145deg,hsl(var(--card)/0.80),hsl(var(--background)/0.54))]",
            iconClassName:
              "border-amber-400/35 bg-amber-500/12 text-amber-700 shadow-amber-500/20 dark:text-amber-200",
            valueClassName: "text-amber-700 dark:text-amber-200",
            railClassName:
              "from-amber-500/80 via-yellow-300/70 to-amber-500/10",
          },
          {
            label: "Awaiting Signature",
            value: pending,
            Icon: Clock,
            className:
              "border-orange-400/25 bg-[radial-gradient(circle_at_18%_0%,hsl(var(--warning)/0.16),transparent_38%),linear-gradient(145deg,hsl(var(--card)/0.97),hsl(var(--background)/0.80))] dark:border-orange-300/25 dark:bg-[radial-gradient(circle_at_18%_0%,hsl(var(--warning)/0.18),transparent_40%),linear-gradient(145deg,hsl(var(--card)/0.80),hsl(var(--background)/0.54))]",
            iconClassName:
              "border-orange-400/35 bg-orange-500/12 text-[hsl(var(--warning))] shadow-orange-500/20",
            valueClassName: "text-[hsl(var(--warning))]",
            railClassName:
              "from-orange-500/80 via-amber-300/70 to-orange-500/10",
          },
          {
            label: "Signed",
            value: totalSigned,
            Icon: CheckCircle2,
            className:
              "border-emerald-400/25 bg-[radial-gradient(circle_at_18%_0%,hsl(158_70%_42%/0.15),transparent_38%),linear-gradient(145deg,hsl(var(--card)/0.97),hsl(var(--background)/0.80))] dark:border-emerald-300/25 dark:bg-[radial-gradient(circle_at_18%_0%,hsl(158_70%_42%/0.17),transparent_40%),linear-gradient(145deg,hsl(var(--card)/0.80),hsl(var(--background)/0.54))]",
            iconClassName:
              "border-emerald-400/35 bg-emerald-500/12 text-emerald-700 shadow-emerald-500/20 dark:text-emerald-200",
            valueClassName: "text-emerald-700 dark:text-emerald-200",
            railClassName:
              "from-emerald-500/80 via-teal-300/70 to-emerald-500/10",
          },
        ].map((stat) => {
          const Icon = stat.Icon;

          return (
            <DashboardThemeFrame
              key={stat.label}
              variant="premiumCard"
              className={cn(
                "group relative min-h-[9.5rem] overflow-hidden p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] ring-1 ring-white/50 transition-all duration-300 ease-out hover:-translate-y-1 hover:border-amber-300/60 hover:shadow-[0_24px_70px_rgba(15,23,42,0.13),0_0_0_1px_hsl(43_84%_52%/0.20),0_0_34px_hsl(43_84%_52%/0.18)] dark:ring-white/10 dark:hover:border-amber-200/35 dark:hover:shadow-[0_24px_70px_rgba(0,0,0,0.34),0_0_0_1px_hsl(43_84%_52%/0.16),0_0_38px_hsl(43_84%_52%/0.14)] sm:p-6",
                stat.className,
              )}
            >
              <span
                className={cn(
                  "absolute inset-x-6 top-0 h-px bg-gradient-to-r",
                  stat.railClassName,
                )}
              />
              <span className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-amber-300/0 blur-2xl transition-colors duration-300 group-hover:bg-amber-300/18 dark:group-hover:bg-amber-200/10" />
              <div className="relative flex h-full flex-col justify-between gap-5">
                <div className="flex items-start justify-between gap-4">
                  <p className="max-w-[11rem] text-[0.72rem] font-semibold uppercase leading-5 tracking-[0.18em] text-muted-foreground/90">
                    {stat.label}
                  </p>
                  <div
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-lg transition-transform duration-300 group-hover:scale-105",
                      stat.iconClassName,
                    )}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                </div>
                <p
                  className={cn(
                    "text-4xl font-black leading-none tracking-[-0.06em] tabular-nums sm:text-5xl",
                    stat.value === 0 && "opacity-90",
                    stat.valueClassName,
                  )}
                >
                  {stat.value}
                </p>
              </div>
            </DashboardThemeFrame>
          );
        })}
      </section>

      <DashboardThemeFrame
        as="section"
        variant="section"
        className="overflow-hidden border-border/70 bg-[linear-gradient(180deg,hsl(var(--card)/0.97),hsl(var(--card)/0.82))] p-0 shadow-[0_26px_80px_rgba(15,23,42,0.12)] ring-1 ring-white/50 dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.84),rgba(2,6,23,0.72))] dark:ring-white/10"
      >
        <div className="relative flex flex-col gap-5 border-b border-border/60 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.10),transparent_34%),linear-gradient(180deg,hsl(var(--muted)/0.28),transparent)] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_0_5px_hsl(var(--primary)/0.13),0_0_22px_hsl(var(--primary)/0.32)]" />
              <CardTitle className="text-xl font-semibold tracking-[-0.03em] text-foreground sm:text-2xl">
                All Agreements
              </CardTitle>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              A searchable agreement ledger for reviewing buyers, delivery
              status, signature milestones, and actions.
            </p>
          </div>
          <div className="group/search relative w-full sm:w-80 lg:w-96">
            <div className="pointer-events-none absolute inset-y-1.5 left-1.5 z-10 flex w-10 items-center justify-center rounded-xl border border-transparent bg-primary/8 text-primary shadow-[inset_0_1px_0_hsl(0_0%_100%/0.32)] transition-all duration-300 group-hover/search:border-amber-300/35 group-hover/search:bg-amber-400/12 group-focus-within/search:border-amber-300/55 group-focus-within/search:bg-amber-400/18 group-focus-within/search:text-amber-700 dark:bg-amber-300/10 dark:text-amber-200 dark:group-hover/search:bg-amber-200/12 dark:group-focus-within/search:bg-amber-200/16 dark:group-focus-within/search:text-amber-100">
              <Search className="h-4 w-4" aria-hidden="true" />
            </div>
            <Input
              placeholder="Search by name, email, status..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-[3.25rem] rounded-[1.15rem] border-border/70 bg-background/95 py-3 pl-14 pr-4 text-[0.95rem] font-medium text-foreground shadow-[0_16px_42px_rgba(15,23,42,0.10),inset_0_1px_0_hsl(0_0%_100%/0.45)] outline-none transition-all duration-300 placeholder:text-muted-foreground/80 hover:border-amber-300/50 hover:bg-background hover:shadow-[0_18px_48px_rgba(15,23,42,0.13),0_0_0_1px_hsl(43_84%_52%/0.12),inset_0_1px_0_hsl(0_0%_100%/0.55)] focus-visible:border-amber-400/70 focus-visible:ring-2 focus-visible:ring-amber-400/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-white/10 dark:bg-slate-950/75 dark:shadow-[0_16px_42px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.08)] dark:placeholder:text-slate-300/70 dark:hover:border-amber-200/35 dark:hover:bg-slate-950/90 dark:hover:shadow-[0_18px_48px_rgba(0,0,0,0.34),0_0_0_1px_hsl(43_84%_52%/0.12),inset_0_1px_0_rgba(255,255,255,0.10)] dark:focus-visible:border-amber-200/60 dark:focus-visible:ring-amber-300/25"
            />
          </div>
        </div>
        <div className="bg-background/20 p-3 sm:p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredAgreements.length === 0 ? (
            <div className="mx-4 my-5 overflow-hidden rounded-[1.35rem] border border-dashed border-amber-300/45 bg-[radial-gradient(circle_at_top,hsl(43_84%_52%/0.14),transparent_38%),linear-gradient(180deg,hsl(var(--card)/0.92),hsl(var(--muted)/0.24))] px-5 py-12 text-center text-sm text-muted-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.35)] dark:border-amber-200/25 dark:bg-[radial-gradient(circle_at_top,hsl(43_84%_52%/0.10),transparent_42%),linear-gradient(180deg,rgba(15,23,42,0.78),rgba(2,6,23,0.48))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/40 bg-amber-400/12 text-amber-700 shadow-[0_14px_34px_hsl(43_84%_32%/0.14)] dark:border-amber-200/25 dark:bg-amber-200/10 dark:text-amber-100">
                {searchTerm ? (
                  <Search className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <FileSignature className="h-5 w-5" aria-hidden="true" />
                )}
              </div>
              <p className="mx-auto max-w-md text-base font-semibold text-foreground">
                {searchTerm
                  ? "No agreements match your search."
                  : 'No agreements sent yet. Open a client and click "Send Agreement" to get started.'}
              </p>
              {searchTerm && (
                <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
                  Check the buyer name, email, or status and try again.
                </p>
              )}
            </div>
          ) : (
            <ScrollArea className="max-h-[600px] rounded-2xl border border-border/70 bg-card/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_18px_44px_rgba(15,23,42,0.08)] [scrollbar-color:hsl(var(--primary)/0.35)_transparent] [scrollbar-width:thin] dark:border-white/10 dark:bg-slate-950/45 dark:shadow-black/20">
              <div className="overflow-x-auto">
                <Table className="min-w-[880px]">
                  <TableHeader className="sticky top-0 z-10 border-b border-border/70 bg-muted/75 shadow-[0_1px_0_hsl(var(--border)/0.75)] backdrop-blur-xl dark:bg-slate-900/90">
                    <TableRow className="border-border/70 hover:bg-transparent">
                      <TableHead className="h-12 text-[0.69rem] font-bold uppercase tracking-[0.18em] text-muted-foreground/90">
                        Buyer
                      </TableHead>
                      <TableHead className="hidden h-12 text-[0.69rem] font-bold uppercase tracking-[0.18em] text-muted-foreground/90 md:table-cell">
                        Email
                      </TableHead>
                      <TableHead className="h-12 text-[0.69rem] font-bold uppercase tracking-[0.18em] text-muted-foreground/90">
                        Status
                      </TableHead>
                      <TableHead className="hidden h-12 text-[0.69rem] font-bold uppercase tracking-[0.18em] text-muted-foreground/90 sm:table-cell">
                        Date
                      </TableHead>
                      <TableHead className="hidden h-12 text-[0.69rem] font-bold uppercase tracking-[0.18em] text-muted-foreground/90 lg:table-cell">
                        Sent
                      </TableHead>
                      <TableHead className="hidden h-12 text-[0.69rem] font-bold uppercase tracking-[0.18em] text-muted-foreground/90 lg:table-cell">
                        Signed
                      </TableHead>
                      <TableHead className="h-12 w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="[&_tr:last-child]:border-0">
                    {filteredAgreements.map((agreement) => (
                      <TableRow
                        key={agreement.id}
                        className="group border-border/55 transition-all duration-300 hover:bg-[linear-gradient(90deg,hsl(43_84%_52%/0.14),hsl(var(--primary)/0.06)_34%,hsl(var(--card)/0.32))] hover:shadow-[inset_4px_0_0_hsl(43_84%_52%/0.9),0_14px_34px_hsl(43_84%_52%/0.10)] dark:hover:bg-[linear-gradient(90deg,hsl(43_84%_52%/0.16),hsl(var(--primary)/0.08)_36%,hsl(var(--card)/0.18))]"
                      >
                        <TableCell className="max-w-[18rem] py-4 pr-5 font-medium">
                          <button
                            className="block max-w-full truncate text-left text-base font-bold leading-6 text-foreground transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:text-[1.02rem]"
                            title={agreement.buyer_names}
                            onClick={() =>
                              handleViewClient(agreement.client_id)
                            }
                          >
                            {agreement.buyer_names}
                          </button>
                          {agreement.secondary_buyer_name && (
                            <span
                              className="mt-1 block max-w-full truncate text-xs font-semibold text-muted-foreground"
                              title={agreement.secondary_buyer_name}
                            >
                              & {agreement.secondary_buyer_name}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden max-w-[17rem] py-4 pr-5 text-sm font-medium text-muted-foreground md:table-cell">
                          {agreement.buyer_email ? (
                            <span
                              className="block max-w-[15.5rem] truncate rounded-lg px-0.5 py-1 transition-colors group-hover:text-foreground/75"
                              title={agreement.buyer_email}
                            >
                              {agreement.buyer_email}
                            </span>
                          ) : (
                            <span className="inline-flex rounded-lg border border-dashed border-border/60 bg-muted/30 px-2 py-1 text-muted-foreground/60">
                              No email
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-4 pr-5 align-middle">
                          {renderDocuSignTracking(agreement)}
                        </TableCell>
                        <TableCell className="hidden py-4 pr-5 text-sm font-medium text-muted-foreground sm:table-cell">
                          {renderAgreementDate(agreement.agreement_date)}
                        </TableCell>
                        <TableCell className="hidden py-4 pr-5 align-middle lg:table-cell">
                          {renderDocuSignTimelineDate(
                            "Sent",
                            agreement.docusign_sent_at,
                            "Not sent",
                            CalendarDays,
                          )}
                        </TableCell>
                        <TableCell className="hidden py-4 pr-5 align-middle lg:table-cell">
                          {renderDocuSignTimelineDate(
                            "Signed",
                            agreement.docusign_signed_at,
                            "Not signed",
                            FileCheck2,
                          )}
                        </TableCell>
                        <TableCell className="py-4 pl-2 pr-4 text-right align-middle">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon"
                                aria-label={`Open actions for agreement with ${agreement.buyer_names}`}
                                className="ml-auto h-10 w-10 rounded-2xl border-border/70 bg-background/85 text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/45 hover:bg-primary/10 hover:text-primary hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 data-[state=open]:border-primary/50 data-[state=open]:bg-primary/12 data-[state=open]:text-primary dark:bg-slate-950/55 dark:hover:bg-primary/15"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              sideOffset={10}
                              collisionPadding={16}
                              className="w-[min(20rem,calc(100vw-2rem))] rounded-2xl border-border/70 bg-popover/95 p-2 text-popover-foreground shadow-2xl shadow-black/15 backdrop-blur supports-[backdrop-filter]:bg-popover/90 dark:border-slate-700/70 dark:shadow-black/35"
                            >
                              <DropdownMenuLabel className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Agreement actions
                              </DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() => handleViewAgreement(agreement)}
                                className="gap-3 rounded-xl px-3 py-2.5 font-medium focus:bg-primary/10 focus:text-primary"
                              >
                                <FileText className="h-4 w-4 text-primary" />
                                View Agreement
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleDownloadAgreement(agreement)
                                }
                                className="gap-3 rounded-xl px-3 py-2.5 focus:bg-accent focus:text-accent-foreground"
                              >
                                <Download className="h-4 w-4 text-muted-foreground" />
                                Download Agreement
                              </DropdownMenuItem>
                              <FlattenPdfMenuItem
                                className="gap-3 rounded-xl px-3 py-2.5 focus:bg-accent focus:text-accent-foreground data-[disabled]:bg-muted/30 data-[disabled]:text-muted-foreground"
                                getPdfBlob={async () => {
                                  const { pdf_url } =
                                    await fetchAgreementPreview(agreement.id);
                                  if (!pdf_url)
                                    throw new Error(
                                      "Agreement PDF not yet generated",
                                    );
                                  return fetchPdfBlob(pdf_url);
                                }}
                                filename={`Agreement_${agreement.buyer_names.replace(/\s+/g, "_")}_${format(new Date(agreement.agreement_date), "yyyy-MM-dd")}.pdf`}
                              />
                              <DropdownMenuItem
                                onClick={() =>
                                  handleViewClient(agreement.client_id)
                                }
                                className="gap-3 rounded-xl px-3 py-2.5 focus:bg-accent focus:text-accent-foreground"
                              >
                                <Eye className="h-4 w-4 text-muted-foreground" />
                                View Client
                              </DropdownMenuItem>
                              {canEditAgreements &&
                                agreement.status === "generated" && (
                                  <>
                                    <DropdownMenuSeparator className="mx-1 my-2 bg-border/70" />
                                    <DropdownMenuItem
                                      onClick={() =>
                                        openPrepareForSigning(agreement)
                                      }
                                      className="gap-3 rounded-xl px-3 py-2.5 font-medium focus:bg-primary/10 focus:text-primary"
                                    >
                                      <FileSignature className="h-4 w-4 text-primary" />
                                      Prepare for Signing
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        handleSendViaDocuSign(agreement)
                                      }
                                      className="gap-3 rounded-xl px-3 py-2.5 font-medium focus:bg-primary/10 focus:text-primary"
                                    >
                                      <Send className="h-4 w-4 text-primary" />
                                      Send via DocuSign (legacy anchors)
                                    </DropdownMenuItem>
                                  </>
                                )}
                              {agreement.docusign_envelope_id && (
                                <>
                                  <DropdownMenuSeparator className="mx-1 my-2 bg-border/70" />
                                  <DropdownMenuItem
                                    onClick={() =>
                                      setStatusAgreement(agreement)
                                    }
                                    className="gap-3 rounded-xl px-3 py-2.5 focus:bg-accent focus:text-accent-foreground"
                                  >
                                    <Eye className="h-4 w-4 text-muted-foreground" />
                                    Envelope Status &amp; Audit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleRefreshStatus(agreement.id)
                                    }
                                    className="gap-3 rounded-xl px-3 py-2.5 focus:bg-accent focus:text-accent-foreground"
                                  >
                                    <RefreshCw className="h-4 w-4 text-muted-foreground" />
                                    Refresh Status
                                  </DropdownMenuItem>
                                </>
                              )}
                              {canEditAgreements &&
                                ["sent", "delivered", "viewed"].includes(
                                  agreement.status,
                                ) && (
                                  <>
                                    <DropdownMenuSeparator className="mx-1 my-2 bg-border/70" />
                                    <DropdownMenuItem
                                      className="gap-3 rounded-xl px-3 py-2.5 text-destructive focus:bg-destructive/10 focus:text-destructive"
                                      onClick={() => handleVoid(agreement.id)}
                                    >
                                      <XCircle className="h-4 w-4" />
                                      Void Agreement
                                    </DropdownMenuItem>
                                  </>
                                )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          )}
        </div>
      </DashboardThemeFrame>

      <GammaTemplateManager />

      {/* Agreement Preview Dialog */}
      <Dialog
        open={!!previewHtml || isPreviewLoading}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewHtml(null);
            setPreviewTitle("");
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border-border/70 bg-card text-card-foreground shadow-2xl">
          <DialogHeader>
            <DialogTitle>{previewTitle}</DialogTitle>
          </DialogHeader>
          {isPreviewLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : previewHtml ? (
            <div className="flex-1 overflow-auto rounded-xl border border-border/70 bg-background">
              {previewHtml.startsWith("__PDF__") ? (
                <iframe
                  src={previewHtml.replace("__PDF__", "")}
                  className="w-full min-h-[70vh] border-0"
                  title="Agreement Preview"
                />
              ) : (
                <iframe
                  srcDoc={previewHtml}
                  className="w-full min-h-[70vh] border-0"
                  title="Agreement Preview"
                  sandbox="allow-same-origin"
                />
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {signingAgreement && (
        <PrepareForSigningModal
          open={!!signingAgreement}
          onOpenChange={(v) => {
            if (!v) setSigningAgreement(null);
          }}
          scope="agreement"
          recordId={signingAgreement.id}
          title={signingAgreement.buyer_names}
          pdfUrl={signingPdfUrl}
          initialRecipients={(signingAgreement as any).signing_recipients || []}
          initialLayout={(signingAgreement as any).signing_layout || []}
          onSent={() => setSigningAgreement(null)}
        />
      )}

      {statusAgreement && (
        <EnvelopeStatusDialog
          open={!!statusAgreement}
          onOpenChange={(v) => {
            if (!v) setStatusAgreement(null);
          }}
          scope="agreement"
          recordId={statusAgreement.id}
          title={`${statusAgreement.buyer_names} — Envelope`}
          agreement={statusAgreement}
        />
      )}
    </DashboardThemeFrame>
  );
}
