import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { invokeSecureFunction } from "@/lib/secureInvoke";
import { useToast } from "@/hooks/use-toast";
import { logActivityDirect } from "@/hooks/useActivityLogger";
import type { PdfDesignOptions } from "./premiumPdfDesign";

interface PremiumPdfButtonProps {
  reportId: string;
  propertyAddress: string;
  includeCharts?: boolean;
  includeHeroImages?: boolean;
  includeSparklines?: boolean;
  designOptions?: PdfDesignOptions;
}

/**
 * Premium PDF — HTML+CSS rendered through WeasyPrint first, with Api2PDF as fallback.
 *
 * Design controls are passed through as explicit renderer inputs so the final
 * PDF changes even when the report markdown has no editorial shortcodes.
 */
export function PremiumPdfButton({
  reportId,
  propertyAddress,
  includeCharts = true,
  includeHeroImages = false,
  includeSparklines = true,
  designOptions,
}: PremiumPdfButtonProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { data, error } = await invokeSecureFunction<{ fileUrl: string; fileName: string }>(
        "render-investment-report-pdf",
        { reportId, includeCharts, includeHeroImages, includeSparklines, designOptions },
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
        metadata: { format: "pdf", source: "premium_weasyprint", designOptions },
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
      {loading ? "Rendering…" : "Premium PDF"}
    </Button>
  );
}
