import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ChartData } from './ChartCard';

type ChartVariant = 'card' | 'expanded' | 'export';

const FALLBACK_COLORS = ['#a855f7', '#8b5cf6', '#c084fc', '#7c3aed', '#d946ef', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

function normaliseConfig(chart: ChartData) {
  const cfg = chart.chart_config || {};
  const source = cfg.data || cfg;
  const labels = source.labels || cfg.labels || [];
  const datasets = source.datasets || cfg.datasets || [];
  const first = datasets[0] || {};
  const values = first.data || source.values || cfg.values || [];
  if (!Array.isArray(labels) || !Array.isArray(values) || labels.length === 0 || values.length === 0) return null;
  const colors = Array.isArray(first.backgroundColor) ? first.backgroundColor : (first.backgroundColor ? [first.backgroundColor] : FALLBACK_COLORS);
  const title = cfg.options?.plugins?.title?.text || cfg.title || chart.title;
  const datasetLabel = first.label || 'Value';
  return {
    type: String(cfg.type || chart.chart_type || '').toLowerCase(),
    title,
    datasetLabel,
    data: labels.map((label: any, index: number) => ({
      name: String(label),
      value: Number(values[index]) || 0,
      fill: colors[index % colors.length] || FALLBACK_COLORS[index % FALLBACK_COLORS.length],
    })),
  };
}

function tickSize(variant: ChartVariant) { return variant === 'card' ? 10 : variant === 'export' ? 24 : 13; }
function titleSize(variant: ChartVariant) { return variant === 'card' ? 12 : variant === 'export' ? 30 : 17; }

export function canRenderLiveChart(chart: ChartData) {
  return Boolean(normaliseConfig(chart));
}

export function LiveChartRenderer({ chart, variant = 'card' }: { chart: ChartData; variant?: ChartVariant }) {
  const model = useMemo(() => normaliseConfig(chart), [chart]);
  if (!model) return null;

  const isCard = variant === 'card';
  const isExport = variant === 'export';
  const fontSize = tickSize(variant);
  const labelSize = isExport ? 22 : isCard ? 9 : 12;
  const titleClass = isCard ? 'text-xs' : isExport ? 'text-[30px]' : 'text-lg';
  const type = model.type.includes('pie') || model.type.includes('doughnut') || model.type.includes('donut') || chart.chart_type.includes('pie') || chart.chart_type.includes('doughnut') ? 'pie'
    : model.type.includes('line') || chart.chart_type.includes('line') || chart.chart_type.includes('trend') ? 'line'
    : 'bar';
  const margin = isCard ? { top: 14, right: 8, left: -12, bottom: 28 } : isExport ? { top: 26, right: 72, left: 44, bottom: 76 } : { top: 24, right: 48, left: 18, bottom: 68 };
  const tooltipStyle = { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: isExport ? 22 : 13 };

  return (
    <div className="flex h-full w-full flex-col bg-white text-slate-900">
      <div className={`shrink-0 text-center font-bold text-slate-800 ${titleClass}`} style={{ fontSize: titleSize(variant), lineHeight: 1.25 }}>{model.title}</div>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%" debounce={0} key={`${chart.id}-${variant}-${type}`}>
          {type === 'pie' ? (
            <PieChart margin={isCard ? { top: 4, right: 4, bottom: 4, left: 4 } : { top: 8, right: 20, bottom: 8, left: 20 }}>
              <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [value, model.datasetLabel]} />
              {!isCard && <Legend layout={isExport ? 'vertical' : 'horizontal'} verticalAlign={isExport ? 'middle' : 'bottom'} align={isExport ? 'right' : 'center'} wrapperStyle={{ fontSize: isExport ? 22 : 13, paddingLeft: 10 }} />}
              <Pie data={model.data} dataKey="value" nameKey="name" cx={isExport ? '43%' : '50%'} cy="50%" outerRadius={isCard ? '72%' : isExport ? '82%' : '78%'} innerRadius={model.type.includes('doughnut') || model.type.includes('donut') ? (isCard ? '38%' : '48%') : 0} label={!isCard ? ({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%` : false} labelLine={!isCard} isAnimationActive={false}>
                {model.data.map((entry, index) => <Cell key={`${entry.name}-${index}`} fill={entry.fill} />)}
              </Pie>
            </PieChart>
          ) : type === 'line' ? (
            <LineChart data={model.data} margin={margin}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" interval={0} angle={isCard ? -35 : -28} textAnchor="end" height={isCard ? 38 : isExport ? 92 : 74} tick={{ fontSize, fill: '#334155' }} />
              <YAxis tick={{ fontSize, fill: '#334155' }} width={isExport ? 72 : 44} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="value" name={model.datasetLabel} stroke="#a855f7" strokeWidth={isExport ? 6 : isCard ? 2 : 3} dot={{ r: isExport ? 7 : isCard ? 3 : 5 }} activeDot={{ r: isExport ? 9 : 7 }} isAnimationActive={false} />
            </LineChart>
          ) : (
            <BarChart data={model.data} margin={margin} barCategoryGap={isCard ? '22%' : '14%'}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" interval={0} angle={isCard ? -40 : -34} textAnchor="end" height={isCard ? 42 : isExport ? 102 : 82} tick={{ fontSize, fill: '#334155' }} />
              <YAxis tick={{ fontSize, fill: '#334155' }} width={isExport ? 72 : 46} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" name={model.datasetLabel} radius={[8, 8, 0, 0]} maxBarSize={isExport ? 120 : isCard ? 42 : 88} isAnimationActive={false}>
                {model.data.map((entry, index) => <Cell key={`${entry.name}-${index}`} fill={entry.fill} />)}
                {!isCard && <LabelList dataKey="value" position="top" style={{ fontSize: labelSize, fill: '#111827', fontWeight: 700 }} />}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
