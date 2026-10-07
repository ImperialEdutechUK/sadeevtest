import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { fmtDate } from '@/lib/format';

const AXIS = { fontSize: 12, fill: '#64748b' };
const GRID = '#e2e8f0';
const SERIES_1 = 'var(--color-series-1)';
const SERIES_2 = 'var(--color-series-2)';

function TooltipBox({ active, payload, label, formatter }: { active?: boolean; payload?: { name: string; value: number | null; color: string }[]; label?: string; formatter?: (label: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-slate-800">{formatter ? formatter(label ?? '') : label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-slate-700">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
          {p.name}: <span className="font-medium text-slate-900">{p.value === null ? 'n/a' : p.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Score over time for one person (single series - no legend needed). */
export function ScoreTrendChart({ points, height = 220 }: { points: { date: string; score: number; title?: string }[]; height?: number }) {
  if (!points.length) return <p className="py-8 text-center text-sm text-slate-500">No completed reviews in this period yet.</p>;
  const data = points.map((p) => ({ ...p, label: fmtDate(p.date, 'd MMM') }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 16, left: -14, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
        <YAxis domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} ticks={[0, 25, 50, 75, 100]} />
        <Tooltip content={<TooltipBox />} cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }} />
        <Line type="monotone" dataKey="score" name="Score" stroke={SERIES_1} strokeWidth={2} dot={{ r: 4, fill: SERIES_1, strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Monthly average with meeting counts (single series). */
export function MonthlyTrendChart({ points, height = 220 }: { points: { month: string; averageScore: number | null; meetings: number }[]; height?: number }) {
  const data = points.map((p) => ({ ...p, label: fmtDate(`${p.month}-01`, 'MMM') }));
  if (!data.some((d) => d.averageScore !== null)) return <p className="py-8 text-center text-sm text-slate-500">No completed reviews in the last six months yet.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 16, left: -14, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} ticks={[0, 25, 50, 75, 100]} />
        <Tooltip content={<TooltipBox />} cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }} />
        <Line type="monotone" dataKey="averageScore" name="Average score" stroke={SERIES_1} strokeWidth={2} connectNulls dot={{ r: 4, fill: SERIES_1, strokeWidth: 2, stroke: '#fff' }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Per-criterion averages, this person vs the college (two series, legend + direct labels). */
export function CriteriaComparisonChart({ rows, height }: { rows: { code: string; title: string; average: number | null; collegeAverage: number | null }[]; height?: number }) {
  const data = rows.filter((r) => r.average !== null).map((r) => ({ name: `${r.code} ${r.title}`, short: r.code, mine: r.average, college: r.collegeAverage }));
  if (!data.length) return <p className="py-8 text-center text-sm text-slate-500">No criteria scores yet.</p>;
  const h = height ?? Math.max(220, data.length * 30 + 40);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }} barCategoryGap={6} barGap={2}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="short" width={36} tick={AXIS} tickLine={false} axisLine={false} />
        <Tooltip content={<TooltipBox formatter={(l) => data.find((d) => d.short === l)?.name ?? l} />} cursor={{ fill: '#f1f5f9' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
        <Bar dataKey="mine" name="This person" fill={SERIES_1} radius={[0, 4, 4, 0]} barSize={10} isAnimationActive={false} />
        <Bar dataKey="college" name="College average" fill={SERIES_2} radius={[0, 4, 4, 0]} barSize={10} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Grade distribution - horizontal bars so the band labels never collide; validated status colours plus a label on each bar. */
export function GradeDistributionChart({ rows, height }: { rows: { label: string; colour: string; count: number }[]; height?: number }) {
  const hex: Record<string, string> = { emerald: '#1b7f3b', teal: '#2a78d6', amber: '#eda100', rose: '#e34948' };
  if (!rows.some((r) => r.count > 0)) return <p className="py-8 text-center text-sm text-slate-500">No graded reports yet.</p>;
  return (
    <ResponsiveContainer width="100%" height={height ?? rows.length * 40 + 30}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 32, left: 4, bottom: 0 }} barCategoryGap={8}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="label" width={104} tick={AXIS} tickLine={false} axisLine={false} />
        <Tooltip content={<TooltipBox />} cursor={{ fill: '#f1f5f9' }} />
        <Bar dataKey="count" name="Meetings" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false} label={{ position: 'right', fontSize: 12, fill: '#334155' }}>
          {rows.map((r) => (
            <Cell key={r.label} fill={hex[r.colour] ?? '#94a3b8'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
