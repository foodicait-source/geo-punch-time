import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatDuration } from "@/lib/geo";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "History · Geo Attendance" }] }),
  component: HistoryPage,
});

interface Row {
  id: string;
  work_date: string;
  check_in_at: string;
  check_out_at: string | null;
  total_minutes: number | null;
}

function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function startOfWeek(d: Date) {
  const x = new Date(d); const day = x.getDay(); x.setDate(x.getDate() - day); x.setHours(0,0,0,0); return x;
}

function HistoryPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"daily" | "weekly" | "monthly">("daily");
  const [cursor, setCursor] = useState(new Date());

  const { from, to } = useMemo(() => {
    if (tab === "daily") return { from: ymd(cursor), to: ymd(cursor) };
    if (tab === "weekly") {
      const s = startOfWeek(cursor); const e = new Date(s); e.setDate(e.getDate()+6);
      return { from: ymd(s), to: ymd(e) };
    }
    return { from: ymd(startOfMonth(cursor)), to: ymd(endOfMonth(cursor)) };
  }, [tab, cursor]);

  const q = useQuery({
    queryKey: ["attendance", "history", user?.id, from, to],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("id,work_date,check_in_at,check_out_at,total_minutes")
        .eq("user_id", user!.id)
        .gte("work_date", from)
        .lte("work_date", to)
        .order("work_date", { ascending: false })
        .order("check_in_at", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });

  const rows = q.data ?? [];
  const totalMin = rows.reduce((acc, r) => acc + (r.total_minutes ?? 0), 0);
  const daysWorked = new Set(rows.filter(r => r.check_out_at).map(r => r.work_date)).size;

  function shift(delta: number) {
    const d = new Date(cursor);
    if (tab === "daily") d.setDate(d.getDate() + delta);
    else if (tab === "weekly") d.setDate(d.getDate() + delta * 7);
    else d.setMonth(d.getMonth() + delta);
    setCursor(d);
  }

  const label = tab === "daily"
    ? cursor.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })
    : tab === "weekly"
      ? `${startOfWeek(cursor).toLocaleDateString(undefined,{month:"short",day:"numeric"})} – ${new Date(startOfWeek(cursor).getTime()+6*86400000).toLocaleDateString(undefined,{month:"short",day:"numeric"})}`
      : cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="px-5 pt-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Attendance</h1>
      <p className="mb-4 text-sm text-muted-foreground">Your check-ins and hours.</p>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mb-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="daily">Daily</TabsTrigger>
          <TabsTrigger value="weekly">Weekly</TabsTrigger>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
        </TabsList>
        <TabsContent value="daily" />
        <TabsContent value="weekly" />
        <TabsContent value="monthly" />
      </Tabs>

      <div className="mb-4 flex items-center justify-between rounded-2xl border border-border bg-card px-2 py-2">
        <button onClick={() => shift(-1)} className="rounded-lg p-2 hover:bg-muted">
          <ChevronLeft className="size-4" />
        </button>
        <p className="text-sm font-semibold">{label}</p>
        <button onClick={() => shift(1)} className="rounded-lg p-2 hover:bg-muted">
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total hours</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{formatDuration(totalMin)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Days worked</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{daysWorked}</p>
        </Card>
      </div>

      <div className="space-y-2">
        {q.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No records in this period.</p>
        ) : (
          rows.map((r) => (
            <Card key={r.id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-semibold">
                  {new Date(r.work_date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                  {new Date(r.check_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {" → "}
                  {r.check_out_at
                    ? new Date(r.check_out_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    : <span className="text-warning">pending</span>}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums">{formatDuration(r.total_minutes)}</p>
                {!r.check_out_at && <p className="text-[10px] uppercase tracking-wider text-warning">Open</p>}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
