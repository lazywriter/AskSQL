"use client";

import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { ChartSpec } from "@/lib/types";

const COLORS = ["#6366f1", "#14b8a6", "#f59e0b", "#ef4444", "#8b5cf6", "#0ea5e9", "#84cc16", "#ec4899"];

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** False when the spec can't be drawn from these rows, so the caller falls back to the table. */
export function canChart(spec: ChartSpec, columns: string[], rows: Record<string, unknown>[]): boolean {
  if (spec.type === "table" || rows.length === 0) return false;
  if (!columns.includes(spec.x) || spec.y.length === 0) return false;
  return spec.y.every((y) => columns.includes(y) && rows.some((r) => typeof r[y] === "number"));
}

export default function ResultChart({ spec, rows }: { spec: ChartSpec; rows: Record<string, unknown>[] }) {
  const tooltip = (
    <Tooltip
      formatter={(v) => (typeof v === "number" ? full.format(v) : String(v))}
      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)" }}
    />
  );
  const axisProps = { stroke: "var(--muted)", fontSize: 12, tickLine: false };

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {spec.type === "pie" ? (
          <PieChart>
            <Pie data={rows} dataKey={spec.y[0]} nameKey={spec.x} innerRadius="45%" outerRadius="80%" paddingAngle={2}>
              {rows.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="var(--card)" />
              ))}
            </Pie>
            {tooltip}
            <Legend />
          </PieChart>
        ) : spec.type === "line" ? (
          <LineChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey={spec.x} {...axisProps} />
            <YAxis {...axisProps} tickFormatter={(v) => compact.format(v)} axisLine={false} />
            {tooltip}
            {spec.y.length > 1 && <Legend />}
            {spec.y.map((y, i) => (
              <Line key={y} type="monotone" dataKey={y} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={rows.length <= 40} />
            ))}
          </LineChart>
        ) : (
          <BarChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey={spec.x} {...axisProps} interval={rows.length > 12 ? "preserveStartEnd" : 0} />
            <YAxis {...axisProps} tickFormatter={(v) => compact.format(v)} axisLine={false} />
            {tooltip}
            {spec.y.length > 1 && <Legend />}
            {spec.y.map((y, i) => (
              <Bar key={y} dataKey={y} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={56} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
