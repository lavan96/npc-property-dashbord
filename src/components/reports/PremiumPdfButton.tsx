import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { invokeSecureFunction } from "@/lib/secureInvoke";
import { useToast } from "@/hooks/use-toast";
import { logActivityDirect } from "@/hooks/useActivityLogger";

interface PremiumPdfButtonProps {
  reportId: string;
  propertyAddress: string;
}

/**
 * Premium PDF — HTML+CSS rendered via Api2PDF Headless Chrome for true editorial layout.
 * Runs side-by-side with the legacy jsPDF generator (PixelPerfectPDFGenerator).
 */
export function PremiumPdfButton({ reportId, propertyAddress }: PremiumPdfButtonProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { data, error } = await invokeSecureFunction<{ fileUrl: string; fileName: string }>(
        "render-investment-report-pdf",
        { reportId },
        { timeoutMs: 120_000 },
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

      // Open hosted PDF in a new tab — Api2PDF serves it with proper Content-Disposition.
      window.open(data.fileUrl, "_blank", "noopener,noreferrer");

      toast({
        title: "Premium PDF ready",
        description: "Opened in a new tab.",
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
