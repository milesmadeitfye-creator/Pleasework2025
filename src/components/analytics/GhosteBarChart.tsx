import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export function GhosteBarChart({
  data,
  xKey = "label",
  yKey = "value",
  title = "Breakdown",
}: {
  data: any[];
  xKey?: string;
  yKey?: string;
  title?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 backdrop-blur p-4 md:p-5 shadow-lg">
      <div className="text-sm text-white/70 mb-3">{title}</div>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data || []}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
            <XAxis dataKey={xKey} tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 12 }} />
            <YAxis tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 12 }} />
            <Tooltip contentStyle={{ background: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.1)" }} />
            <Bar dataKey={yKey} fill="#1A6CFF" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
