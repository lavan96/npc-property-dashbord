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

function prepareSvgForExport(svgContent: string): string {
  // Ensure SVG has explicit dimensions and inline font styles so text renders in <img>
  let svg = svgContent;

  // Inject a default font-family style if not already present
  if (!svg.includes('font-family')) {
    svg = svg.replace(
      /<svg([^>]*)>/,
      '<svg$1><style>text, tspan { font-family: Arial, Helvetica, sans-serif; }</style>'
    );
  }

  // Ensure SVG has width/height attributes for proper canvas sizing
  if (!svg.includes('width=') || !svg.includes('height=')) {
    const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
    if (viewBoxMatch) {
      const [, , , w, h] = viewBoxMatch[1].split(/\s+/);
      if (!svg.includes('width=')) svg = svg.replace('<svg', `<svg width="${w}"`);
      if (!svg.includes('height=')) svg = svg.replace('<svg', `<svg height="${h}"`);
    } else {
      svg = svg.replace('<svg', '<svg width="800" height="600"');
    }
  }

  // Set xmlns if missing (required for Blob rendering)
  if (!svg.includes('xmlns=')) {
    svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  return svg;
}

function svgToCanvas(svgContent: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const prepared = prepareSvgForExport(svgContent);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return reject(new Error('Canvas not supported'));

    const img = new Image();
    const blob = new Blob([prepared], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      // Use 2x scale for crisp text/labels
      const scale = 2;
      const w = img.naturalWidth || 800;
      const h = img.naturalHeight || 600;
      canvas.width = w * scale;
      canvas.height = h * scale;
      ctx.scale(scale, scale);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
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
      toast.error('Failed to export chart. Refresh the chart gallery, then try exporting again.');
    }
  }, []);

  const exportBulk = useCallback(async (charts: ChartData[], includeAnalysis = true) => {
    if (charts.length === 0) {
      toast.error('No charts selected. Select at least one chart to export.');
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
