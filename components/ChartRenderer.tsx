// components/ChartRenderer.tsx
// ── Lazy chunk — recharts only loads when a chart message is rendered ──
import React, { memo } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, LineChart, Line,
} from 'recharts';

const ChartTooltip = memo(({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{label}</p>
      <p className="chart-tooltip-value">{payload[0].value}</p>
    </div>
  );
});

const ChartRenderer = memo(({ dataStr }: { dataStr: string }) => {
  try {
    const { type = 'area', data, label = 'Data' } = JSON.parse(dataStr);
    const accent = 'var(--accent)';
    const chartProps = { data, margin: { top: 8, right: 8, left: -20, bottom: 0 } };
    const axisProps = { axisLine: false, tickLine: false, tick: { fontSize: 10, fill: 'var(--text-secondary)', fontWeight: 600 } };
    return (
      <div className="enhanced-chart-container">
        <p className="enhanced-chart-label">{label}</p>
        <div className="enhanced-chart-inner">
          <ResponsiveContainer width="100%" height="100%">
            {type === 'bar' ? (
              <BarChart {...chartProps}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" {...axisProps} dy={8} />
                <YAxis {...axisProps} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="value" fill={accent} radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : type === 'line' ? (
              <LineChart {...chartProps}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" {...axisProps} dy={8} />
                <YAxis {...axisProps} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="value" stroke={accent} strokeWidth={2} dot={{ r: 3, fill: 'var(--bg-primary)', strokeWidth: 2 }} activeDot={{ r: 4 }} />
              </LineChart>
            ) : (
              <AreaChart {...chartProps}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={accent} stopOpacity={0.12} />
                    <stop offset="95%" stopColor={accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" {...axisProps} dy={8} />
                <YAxis {...axisProps} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="value" stroke={accent} strokeWidth={2} fillOpacity={1} fill="url(#areaGrad)" />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    );
  } catch { return null; }
});

export default ChartRenderer;
