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

  if (chart.image_data.startsWith('data:image/')) {
    return chart.image_data;
  }

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

/** Enhancement #6: Render analysis text as caption on the exported PNG */
async function chartToDataUrlWithAnalysis(chart: ChartData): Promise<string> {
  const baseDataUrl = await chartToDataUrl(chart);

  if (!chart.analysis_text) return baseDataUrl;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const padding = 20;
      const maxTextWidth = img.width - padding * 2;
      const fontSize = 13;
      const lineHeight = 18;

      // Measure text lines
      const measureCanvas = document.createElement('canvas');
      const mCtx = measureCanvas.getContext('2d');
      if (!mCtx) { resolve(baseDataUrl); return; }
      mCtx.font = `${fontSize}px Arial, sans-serif`;

      const words = chart.analysis_text!.split(' ');
      const lines: string[] = [];
      let currentLine = '';
      for (const word of words) {
        const test = currentLine ? `${currentLine} ${word}` : word;
        if (mCtx.measureText(test).width > maxTextWidth) {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = test;
        }
      }
      if (currentLine) lines.push(currentLine);

      // Limit to 4 lines
      const displayLines = lines.slice(0, 4);
      if (lines.length > 4) displayLines[3] = displayLines[3].slice(0, -3) + '...';

      const captionHeight = displayLines.length * lineHeight + padding * 2 + 10;

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height + captionHeight;
      const ctx = canvas.getContext('2d')!;

      // White background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw chart image
      ctx.drawImage(img, 0, 0);

      // Draw caption area
      ctx.fillStyle = '#fffbeb';
      ctx.fillRect(0, img.height, canvas.width, captionHeight);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(0, img.height, canvas.width, 2);

      // Draw caption header
      ctx.font = `bold ${fontSize}px Arial, sans-serif`;
      ctx.fillStyle = '#b45309';
      ctx.fillText('✨ Analysis', padding, img.height + padding + fontSize);

      // Draw caption text
      ctx.font = `${fontSize}px Arial, sans-serif`;
      ctx.fillStyle = '#78350f';
      displayLines.forEach((line, i) => {
        ctx.fillText(line, padding, img.height + padding + fontSize + lineHeight + i * lineHeight);
      });

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = baseDataUrl;
  });
}

export function useChartExport() {
  const exportSingle = useCallback(async (chart: ChartData, includeAnalysis = true) => {
    try {
      const dataUrl = includeAnalysis && chart.analysis_text
        ? await chartToDataUrlWithAnalysis(chart)
        : await chartToDataUrl(chart);
      const filename = `${sanitizeFilename(chart.title)}_${chart.chart_type}.png`;
      downloadDataUrl(dataUrl, filename);
      toast.success(`Exported "${chart.title}"`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export chart');
    }
  }, []);

  const exportBulk = useCallback(async (charts: ChartData[], includeAnalysis = true) => {
    if (charts.length === 0) {
      toast.error('No charts selected');
      return;
    }

    if (charts.length === 1) {
      return exportSingle(charts[0], includeAnalysis);
    }

    toast.info(`Exporting ${charts.length} charts...`);

    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      for (let i = 0; i < charts.length; i++) {
        try {
          const dataUrl = includeAnalysis && charts[i].analysis_text
            ? await chartToDataUrlWithAnalysis(charts[i])
            : await chartToDataUrl(charts[i]);
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
      for (const chart of charts) {
        await exportSingle(chart, includeAnalysis);
        await new Promise(r => setTimeout(r, 300));
      }
    }
  }, [exportSingle]);

  return { exportSingle, exportBulk };
}
