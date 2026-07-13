// LiveChart — the shared primitive that renders any NormalisedChartModel.
//
// Consumers should NOT reach into Recharts directly. Feed a raw chart record
// through `normaliseChartConfig` (or pass one you already normalized) and let
// this primitive handle:
//   • Bar / horizontal bar / stacked bar
//   • Line / Area / Stacked area
//   • Pie / Donut
//   • Scatter, Radar, Combo (bar + line + area mix)
//   • Card / expanded / export variants (fonts, margins, legend density)
//
// Rendering intentionally uses `isAnimationActive={false}` so exports and
// virtualised card grids remain deterministic.

import { useMemo } from 'react';
import {
  Area, AreaChart,
  Bar, BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line, LineChart,
  Pie, PieChart,
  PolarAngleAxis, PolarGrid, PolarRadiusAxis,
  Radar, RadarChart,
  ResponsiveContainer,
  Scatter, ScatterChart,
  Tooltip,
  XAxis, YAxis, ZAxis,
} from 'recharts';
import {
  normaliseChartConfig,
  type NormalisedChartModel,
} from './normaliseChartConfig';

export type LiveChartVariant = 'card' | 'expanded' | 'export';

interface LiveChartProps {
  chart?: {
    id?: string;
    chart_type?: string;
    title?: string;
    chart_config?: any;
  };
  model?: NormalisedChartModel | null;
  variant?: LiveChartVariant;
  className?: string;
}

function tickSize(v: LiveChartVariant) { return v === 'card' ? 10 : v === 'export' ? 24 : 13; }
function titleSize(v: LiveChartVariant) { return v === 'card' ? 12 : v === 'export' ? 30 : 17; }
function legendFont(v: LiveChartVariant) { return v === 'export' ? 22 : v === 'card' ? 10 : 13; }
function marginFor(v: LiveChartVariant) {
  return v === 'card'
    ? { top: 14, right: 8, left: -12, bottom: 28 }
    : v === 'export'
      ? { top: 26, right: 72, left: 44, bottom: 76 }
      : { top: 24, right: 48, left: 18, bottom: 68 };
}

export function LiveChart({ chart, model: providedModel, variant = 'card', className }: LiveChartProps) {
  const model = useMemo(
    () => providedModel ?? (chart ? normaliseChartConfig(chart) : null),
    [providedModel, chart],
  );
  if (!model) return null;

  const isCard = variant === 'card';
  const isExport = variant === 'export';
  const fontSize = tickSize(variant);
  const labelSize = isExport ? 22 : isCard ? 9 : 12;
  const tooltipStyle = { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: isExport ? 22 : 13 };
  const legendStyle = { fontSize: legendFont(variant), paddingTop: isCard ? 4 : 8 };
  const margin = marginFor(variant);
  const containerKey = `${chart?.id || 'live'}-${variant}-${model.kind}`;

  const showLegend = !isCard || model.series.length > 1;
  const barSize = isExport ? 120 : isCard ? 42 : 88;

  return (
    <div className={`flex h-full w-full flex-col bg-white text-slate-900 ${className || ''}`}>
      <div className="shrink-0 text-center font-bold text-slate-800" style={{ fontSize: titleSize(variant), lineHeight: 1.25 }}>
        {model.title}
      </div>
      {model.subtitle ? (
        <div className="shrink-0 text-center text-slate-500" style={{ fontSize: Math.round(titleSize(variant) * 0.72) }}>
          {model.subtitle}
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%" debounce={0} key={containerKey}>
          {renderInner({ model, variant, isCard, isExport, fontSize, labelSize, tooltipStyle, legendStyle, margin, showLegend, barSize })}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

interface InnerCtx {
  model: NormalisedChartModel;
  variant: LiveChartVariant;
  isCard: boolean;
  isExport: boolean;
  fontSize: number;
  labelSize: number;
  tooltipStyle: React.CSSProperties;
  legendStyle: React.CSSProperties;
  margin: { top: number; right: number; bottom: number; left: number };
  showLegend: boolean;
  barSize: number;
}

function renderInner(ctx: InnerCtx): React.ReactElement {
  const { model } = ctx;
  switch (model.kind) {
    case 'pie':
    case 'donut':
      return renderPie(ctx);
    case 'scatter':
      return renderScatter(ctx);
    case 'radar':
      return renderRadar(ctx);
    case 'line':
      return renderLine(ctx);
    case 'area':
    case 'area-stacked':
      return renderArea(ctx);
    case 'combo':
      return renderCombo(ctx);
    case 'bar-horizontal':
      return renderBar(ctx, { horizontal: true });
    case 'bar-stacked':
      return renderBar(ctx, { stacked: true });
    case 'bar':
    default:
      return renderBar(ctx, {});
  }
}

function axisTick(fontSize: number) { return { fontSize, fill: '#334155' }; }

function renderBar(ctx: InnerCtx, opts: { stacked?: boolean; horizontal?: boolean }) {
  const { model, isCard, isExport, fontSize, labelSize, tooltipStyle, legendStyle, margin, showLegend, barSize } = ctx;
  const stacked = opts.stacked || model.stacked;
  const horizontal = opts.horizontal || model.horizontal;
  const layout = horizontal ? 'vertical' : 'horizontal';

  return (
    <BarChart data={model.data} margin={margin} layout={layout} barCategoryGap={isCard ? '22%' : '14%'}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={horizontal} horizontal={!horizontal} />
      {horizontal ? (
        <>
          <XAxis type="number" tick={axisTick(fontSize)} allowDecimals={false} />
          <YAxis type="category" dataKey="name" tick={axisTick(fontSize)} width={isExport ? 180 : 110} />
        </>
      ) : (
        <>
          <XAxis dataKey="name" interval={0} angle={isCard ? -40 : -34} textAnchor="end" height={isCard ? 42 : isExport ? 102 : 82} tick={axisTick(fontSize)} />
          <YAxis tick={axisTick(fontSize)} width={isExport ? 72 : 46} allowDecimals={false} />
        </>
      )}
      <Tooltip contentStyle={tooltipStyle} />
      {showLegend && <Legend wrapperStyle={legendStyle} />}
      {model.series.map((s, i) => (
        <Bar
          key={s.key}
          dataKey={s.key}
          name={s.label}
          fill={s.color}
          stackId={stacked ? 'stack' : undefined}
          radius={stacked ? 0 : [8, 8, 0, 0]}
          maxBarSize={barSize}
          isAnimationActive={false}
        >
          {/* Per-slice recolor for single-series pie-like bar palettes */}
          {model.series.length === 1 && model.pieSlices
            ? model.pieSlices.map((slice, idx) => <Cell key={idx} fill={slice.fill} />)
            : null}
          {!isCard && model.series.length === 1 && !stacked && !horizontal ? (
            <LabelList dataKey={s.key} position="top" style={{ fontSize: labelSize, fill: '#111827', fontWeight: 700 }} />
          ) : null}
        </Bar>
      ))}
    </BarChart>
  );
}

function renderLine(ctx: InnerCtx) {
  const { model, fontSize, tooltipStyle, legendStyle, margin, showLegend, isCard, isExport } = ctx;
  return (
    <LineChart data={model.data} margin={margin}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
      <XAxis dataKey="name" interval={0} angle={isCard ? -35 : -28} textAnchor="end" height={isCard ? 38 : isExport ? 92 : 74} tick={axisTick(fontSize)} />
      <YAxis tick={axisTick(fontSize)} width={isExport ? 72 : 44} />
      <Tooltip contentStyle={tooltipStyle} />
      {showLegend && <Legend wrapperStyle={legendStyle} />}
      {model.series.map((s) => (
        <Line
          key={s.key}
          type="monotone"
          dataKey={s.key}
          name={s.label}
          stroke={s.color}
          strokeWidth={isExport ? 6 : isCard ? 2 : 3}
          dot={{ r: isExport ? 7 : isCard ? 3 : 5, fill: s.color }}
          activeDot={{ r: isExport ? 9 : 7 }}
          isAnimationActive={false}
        />
      ))}
    </LineChart>
  );
}

function renderArea(ctx: InnerCtx) {
  const { model, fontSize, tooltipStyle, legendStyle, margin, showLegend, isCard, isExport } = ctx;
  const stacked = model.kind === 'area-stacked' || model.stacked;
  return (
    <AreaChart data={model.data} margin={margin}>
      <defs>
        {model.series.map((s) => (
          <linearGradient id={`grad-${s.key}`} key={s.key} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity={0.55} />
            <stop offset="100%" stopColor={s.color} stopOpacity={0.05} />
          </linearGradient>
        ))}
      </defs>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
      <XAxis dataKey="name" interval={0} angle={isCard ? -35 : -28} textAnchor="end" height={isCard ? 38 : isExport ? 92 : 74} tick={axisTick(fontSize)} />
      <YAxis tick={axisTick(fontSize)} width={isExport ? 72 : 44} />
      <Tooltip contentStyle={tooltipStyle} />
      {showLegend && <Legend wrapperStyle={legendStyle} />}
      {model.series.map((s) => (
        <Area
          key={s.key}
          type="monotone"
          dataKey={s.key}
          name={s.label}
          stroke={s.color}
          strokeWidth={isExport ? 4 : 2}
          fill={`url(#grad-${s.key})`}
          stackId={stacked ? 'stack' : undefined}
          isAnimationActive={false}
        />
      ))}
    </AreaChart>
  );
}

function renderPie(ctx: InnerCtx) {
  const { model, isCard, isExport, tooltipStyle, legendStyle } = ctx;
  const slices = model.pieSlices || [];
  const innerRadius = model.kind === 'donut' ? (isCard ? '38%' : '48%') : 0;
  return (
    <PieChart margin={isCard ? { top: 4, right: 4, bottom: 4, left: 4 } : { top: 8, right: 20, bottom: 8, left: 20 }}>
      <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [value, name]} />
      {!isCard && (
        <Legend
          layout={isExport ? 'vertical' : 'horizontal'}
          verticalAlign={isExport ? 'middle' : 'bottom'}
          align={isExport ? 'right' : 'center'}
          wrapperStyle={legendStyle}
        />
      )}
      <Pie
        data={slices}
        dataKey="value"
        nameKey="name"
        cx={isExport ? '43%' : '50%'}
        cy="50%"
        outerRadius={isCard ? '72%' : isExport ? '82%' : '78%'}
        innerRadius={innerRadius}
        label={!isCard ? ({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%` : false}
        labelLine={!isCard}
        isAnimationActive={false}
      >
        {slices.map((entry, i) => <Cell key={`${entry.name}-${i}`} fill={entry.fill} />)}
      </Pie>
    </PieChart>
  );
}

function renderScatter(ctx: InnerCtx) {
  const { model, fontSize, tooltipStyle, legendStyle, margin, showLegend } = ctx;
  return (
    <ScatterChart margin={margin}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
      <XAxis dataKey="name" tick={axisTick(fontSize)} />
      <YAxis tick={axisTick(fontSize)} />
      <ZAxis range={[60, 240]} />
      <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: '3 3' }} />
      {showLegend && <Legend wrapperStyle={legendStyle} />}
      {model.series.map((s) => (
        <Scatter key={s.key} name={s.label} data={model.data.map((row) => ({ name: row.name, [s.key]: row[s.key] }))} fill={s.color} dataKey={s.key} isAnimationActive={false} />
      ))}
    </ScatterChart>
  );
}

function renderRadar(ctx: InnerCtx) {
  const { model, tooltipStyle, legendStyle, showLegend, fontSize } = ctx;
  return (
    <RadarChart data={model.data} outerRadius="72%">
      <PolarGrid stroke="#e2e8f0" />
      <PolarAngleAxis dataKey="name" tick={axisTick(fontSize)} />
      <PolarRadiusAxis tick={axisTick(fontSize)} />
      <Tooltip contentStyle={tooltipStyle} />
      {showLegend && <Legend wrapperStyle={legendStyle} />}
      {model.series.map((s) => (
        <Radar key={s.key} name={s.label} dataKey={s.key} stroke={s.color} fill={s.color} fillOpacity={0.28} isAnimationActive={false} />
      ))}
    </RadarChart>
  );
}

function renderCombo(ctx: InnerCtx) {
  const { model, fontSize, tooltipStyle, legendStyle, margin, showLegend, isCard, isExport, barSize } = ctx;
  return (
    <ComposedChart data={model.data} margin={margin}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
      <XAxis dataKey="name" interval={0} angle={isCard ? -35 : -28} textAnchor="end" height={isCard ? 38 : isExport ? 92 : 74} tick={axisTick(fontSize)} />
      <YAxis tick={axisTick(fontSize)} width={isExport ? 72 : 44} />
      <Tooltip contentStyle={tooltipStyle} />
      {showLegend && <Legend wrapperStyle={legendStyle} />}
      {model.series.map((s) => {
        const type = s.type || 'bar';
        if (type === 'line') {
          return <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={isExport ? 5 : 2.5} dot={{ r: isCard ? 3 : 5 }} isAnimationActive={false} />;
        }
        if (type === 'area') {
          return <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} fill={s.color} fillOpacity={0.24} isAnimationActive={false} />;
        }
        return <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} maxBarSize={barSize} radius={[6, 6, 0, 0]} isAnimationActive={false} />;
      })}
    </ComposedChart>
  );
}
