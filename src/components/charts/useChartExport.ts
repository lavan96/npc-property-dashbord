import { useCallback } from 'react';
import { toast } from 'sonner';
import type { ChartData } from './ChartCard';

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function svgToCanvas(svgContent: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return reject(new Error('Canvas not supported'));

    const img = new Image();
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      canvas.width = img.naturalWidth || 800;
      canvas.height = img.naturalHeight || 600;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load SVG'));
    };
    img.src = url;
  });
}

async function chartToDataUrl(chart: ChartData): Promise<string> {
  if (!chart.image_data) throw new Error('No image data');

  if (chart.image_data.startsWith('data:image/svg+xml;base64,')) {
    const svgContent = atob(chart.image_data.replace('data:image/svg+xml;base64,', ''));
    const canvas = await svgToCanvas(svgContent);
    return canvas.toDataURL('image/png');
  }

  // Already a data URL or regular image
  if (chart.image_data.startsWith('data:image/')) {
    return chart.image_data;
  }

  // URL-based image — fetch and convert
  const response = await fetch(chart.image_data);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function sanitizeFilename(title: string): string {
  return title.replace(/[^a-zA-Z0-9\s-_]/g, '').replace(/\s+/g, '_').substring(0, 50);
}

export function useChartExport() {
  const exportSingle = useCallback(async (chart: ChartData) => {
    try {
      const dataUrl = await chartToDataUrl(chart);
      const filename = `${sanitizeFilename(chart.title)}_${chart.chart_type}.png`;
      downloadDataUrl(dataUrl, filename);
      toast.success(`Exported "${chart.title}"`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export chart');
    }
  }, []);

  const exportBulk = useCallback(async (charts: ChartData[]) => {
    if (charts.length === 0) {
      toast.error('No charts selected');
      return;
    }

    if (charts.length === 1) {
      return exportSingle(charts[0]);
    }

    toast.info(`Exporting ${charts.length} charts...`);

    // For bulk, we use JSZip if available, otherwise download individually
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      for (let i = 0; i < charts.length; i++) {
        try {
          const dataUrl = await chartToDataUrl(charts[i]);
          const base64Data = dataUrl.split(',')[1];
          const filename = `${String(i + 1).padStart(2, '0')}_${sanitizeFilename(charts[i].title)}.png`;
          zip.file(filename, base64Data, { base64: true });
        } catch (e) {
          console.error(`Failed to process chart: ${charts[i].title}`, e);
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      downloadDataUrl(url, `charts_export_${new Date().toISOString().slice(0, 10)}.zip`);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${charts.length} charts as ZIP`);
    } catch {
      // Fallback: download one by one
      for (const chart of charts) {
        await exportSingle(chart);
        await new Promise(r => setTimeout(r, 300));
      }
    }
  }, [exportSingle]);

  return { exportSingle, exportBulk };
}
