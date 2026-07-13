import { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import html2canvas from 'html2canvas';
import { renderChartImage } from './ChartCard';
import { getChartTypeConfig } from './ChartCard';
import { format } from 'date-fns';
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


async function renderFullExportComposition(chart: ChartData): Promise<string> {
  const cfg = getChartTypeConfig(chart.chart_type);
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.width = '1800px';
  host.style.background = '#ffffff';
  host.style.zIndex = '-1';
  document.body.appendChild(host);

  const root = createRoot(host);
  root.render(
    <div style={{ width: 1800, background: '#ffffff', color: '#0f172a', fontFamily: 'Arial, Helvetica, sans-serif', padding: 72, boxSizing: 'border-box' }}>
      <div style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: 28, marginBottom: 36 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', borderRadius: 999, padding: '8px 16px', fontSize: 18, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 18 }}>
          <span>{cfg.emoji}</span><span>{cfg.label}</span>
        </div>
        <h1 style={{ margin: 0, fontSize: 46, lineHeight: 1.12, fontWeight: 900, letterSpacing: -1.2 }}>{chart.title}</h1>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 18, color: '#475569', fontSize: 20, fontWeight: 600 }}>
          {chart.generated_reports?.title && <span>Report: {chart.generated_reports.title}</span>}
          <span>Generated: {format(new Date(chart.created_at), 'PPp')}</span>
        </div>
      </div>
      <div style={{ height: 900, border: '1px solid #e2e8f0', borderRadius: 28, padding: 34, boxSizing: 'border-box', background: '#ffffff', boxShadow: '0 18px 44px rgba(15,23,42,0.10)' }}>
        {renderChartImage(chart, 'export')}
      </div>
      {chart.analysis_text && (
        <section style={{ marginTop: 40, border: '1px solid #f3d08a', borderRadius: 28, background: 'linear-gradient(135deg,#fffbeb,#ffffff)', padding: 34 }}>
          <h2 style={{ margin: '0 0 18px', fontSize: 28, lineHeight: 1.2, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', color: '#92400e' }}>Analysis</h2>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 23, lineHeight: 1.62, color: '#334155' }}>{chart.analysis_text}</p>
        </section>
      )}
    </div>
  );

  try {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const target = host.firstElementChild as HTMLElement;
    if (!target || target.offsetHeight <= 0) throw new Error('Export layout did not render');
    const canvas = await html2canvas(target, {
      backgroundColor: '#ffffff',
      scale: target.offsetHeight > 12000 ? 1 : 1.5,
      useCORS: true,
      logging: false,
      windowWidth: 1800,
      windowHeight: target.offsetHeight,
    });
    return canvas.toDataURL('image/png');
  } finally {
    root.unmount();
    host.remove();
  }
}

function sanitizeFilename(title: string): string {
  return title.replace(/[^a-zA-Z0-9\s-_]/g, '').replace(/\s+/g, '_').substring(0, 50);
}

export function useChartExport() {
  const [exporting, setExporting] = useState(false);
  const exportSingle = useCallback(async (chart: ChartData, includeAnalysis = true) => {
    if (exporting) return;
    setExporting(true);
    try {
      const dataUrl = includeAnalysis
        ? await renderFullExportComposition(chart)
        : await chartToDataUrl(chart);
      const filename = `${sanitizeFilename(chart.title)}_${chart.chart_type}.png`;
      downloadDataUrl(dataUrl, filename);
      toast.success(`Exported "${chart.title}"`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export chart. Refresh the chart gallery, then try exporting again.');
    } finally {
      setExporting(false);
    }
  }, [exporting]);

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
          const dataUrl = includeAnalysis
            ? await renderFullExportComposition(charts[i])
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

  return { exportSingle, exportBulk, exporting };
}
