import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { invokeSecureFunction } from "@/lib/secureInvoke";
import { useToast } from "@/hooks/use-toast";
import { logActivityDirect } from "@/hooks/useActivityLogger";

interface PremiumPdfButtonProps {
  reportId: string;
  propertyAddress: string;
  includeCharts?: boolean;
  includeHeroImages?: boolean;
  includeSparklines?: boolean;
}

interface HeroProgress {
  total: number;
  ready: number;
  pending: number;
  processing: number;
  failed: number;
}

const HERO_PROCESS_BATCH = 3;
const HERO_MAX_WAIT_MS = 8 * 60 * 1000; // 8 minutes ceiling for image prep
const HERO_POLL_DELAY_MS = 1500;

/**
 * Premium PDF — HTML+CSS rendered via Api2PDF Headless Chrome for true editorial layout.
 *
 * When hero images are requested, we first orchestrate the async worker
 * (`prepare-report-hero-images`) to enqueue + generate banners in small batches.
 * The actual PDF render function is now lightweight — it only consumes
 * pre-generated hero URLs, so it no longer 504s on AI image generation.
 */
export function PremiumPdfButton({
  reportId,
  propertyAddress,
  includeCharts = true,
  includeHeroImages = false,
  includeSparklines = true,
}: PremiumPdfButtonProps) {
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<string>("");
  const { toast } = useToast();

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /**
   * Drive the worker until every hero image is either `ready` or has
   * exceeded its retry budget (`failed` with attempts>=3). Returns the
   * final progress object so the caller can decide whether to proceed.
   */
  const prepareHeroImages = async (): Promise<HeroProgress> => {
    setStage("Preparing premium visuals…");
    // 1. Enqueue
    const enq = await invokeSecureFunction<HeroProgress & { enqueued: number }>(
      "prepare-report-hero-images",
      { action: "enqueue", reportId },
      { timeoutMs: 60_000 },
    );
    if (enq.error) throw new Error(enq.error.message || "Failed to enqueue hero images");

    // 2. Process loop
    const deadline = Date.now() + HERO_MAX_WAIT_MS;
    let last: HeroProgress = {
      total: enq.data?.total ?? 0,
      ready: enq.data?.ready ?? 0,
      pending: enq.data?.pending ?? 0,
      processing: enq.data?.processing ?? 0,
      failed: enq.data?.failed ?? 0,
    };

    while (Date.now() < deadline) {
      const remaining = last.pending + last.processing;
      if (remaining === 0) break;

      setStage(`Generating visuals · ${last.ready}/${last.total} ready`);
      const proc = await invokeSecureFunction<HeroProgress & { processed: number }>(
        "prepare-report-hero-images",
        { action: "process", reportId, max: HERO_PROCESS_BATCH },
        { timeoutMs: 180_000 },
      );
      if (proc.error) {
        console.warn("[PremiumPdfButton] process error", proc.error);
        // Don't hard-fail — fall through to status poll and let the renderer
        // use SVG fallbacks for anything still missing.
        await sleep(HERO_POLL_DELAY_MS);
      } else if (proc.data) {
        last = {
          total: proc.data.total,
          ready: proc.data.ready,
          pending: proc.data.pending,
          processing: proc.data.processing,
          failed: proc.data.failed,
        };
      }
      if (last.pending + last.processing === 0) break;
      await sleep(HERO_POLL_DELAY_MS);
    }

    return last;
  };

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    setStage("Starting…");
    try {
      if (includeHeroImages) {
        const progress = await prepareHeroImages();
        if (progress.total === 0) {
          // Report has no chapters / no titles extracted — render plain.
        } else if (progress.ready < progress.total) {
          toast({
            title: "Some visuals not ready",
            description: `${progress.ready}/${progress.total} hero banners generated. Missing chapters will use a fallback banner.`,
          });
        }
      }

      setStage("Rendering PDF…");
      const { data, error } = await invokeSecureFunction<{ fileUrl: string; fileName: string }>(
        "render-investment-report-pdf",
        { reportId, includeCharts, includeHeroImages, includeSparklines },
        { timeoutMs: 240_000 },
      );

      if (error || !data?.fileUrl) {
        throw new Error(error?.message || "PDF generation failed");
      }

      logActivityDirect({
        actionType: "report_pdf_downloaded",
        entityType: "investment_report",
        entityId: reportId,
        entityName: propertyAddress,
        metadata: { format: "pdf", source: "premium_api2pdf_chrome" },
      });

      try {
        const res = await fetch(data.fileUrl);
        if (!res.ok) throw new Error(`Download failed (${res.status})`);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = data.fileName || `investment-report-${reportId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      } catch (dlErr) {
        console.warn("[PremiumPdfButton] blob download failed, falling back to window.open", dlErr);
        window.open(data.fileUrl, "_blank", "noopener,noreferrer");
      }

      toast({
        title: "Premium PDF ready",
        description: "Your download should begin shortly.",
      });
    } catch (err: any) {
      console.error("[PremiumPdfButton]", err);
      toast({
        title: "Premium PDF failed",
        description: err?.message || "Try the standard PDF or retry shortly.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setStage("");
    }
  };

  return (
    <Button
      variant="default"
      size="sm"
      onClick={handleClick}
      disabled={loading}
      className="bg-gradient-to-r from-primary to-primary/70 hover:from-primary/90 hover:to-primary/60"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
      ) : (
        <Sparkles className="h-4 w-4 mr-1" />
      )}
      {loading ? (stage || "Rendering…") : "Premium PDF"}
    </Button>
  );
}
