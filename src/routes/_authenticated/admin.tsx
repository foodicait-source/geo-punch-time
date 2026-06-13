import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Download, Users2, Clock, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatDuration } from "@/lib/geo";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin · Geo Attendance" }] }),
  component: AdminPage,
});

interface Row {
  id: string;
  user_id: string;
  work_date: string;
  check_in_at: string;
  check_out_at: string | null;
  total_minutes: number | null;
  office_id: string | null;
}

const LATE_HOUR = 9; // 9am threshold for "late"

function AdminPage() {
  const { role, loading } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [userFilter, setUserFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "complete" | "open" | "late">("all");

  const profilesQ = useQuery({
    queryKey: ["admin", "profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id,full_name,email");
      if (error) throw error;
      return data;
    },
    enabled: role === "admin",
  });

  const officesQ = useQuery({
    queryKey: ["admin", "offices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("offices").select("id,name");
      if (error) throw error;
      return data;
    },
    enabled: role === "admin",
  });

  const attQ = useQuery({
    queryKey: ["admin", "attendance", from, to],
    enabled: role === "admin",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("id,user_id,work_date,check_in_at,check_out_at,total_minutes,office_id")
        .gte("work_date", from)
        .lte("work_date", to)
        .order("work_date", { ascending: false })
        .order("check_in_at", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });

  const rows = attQ.data ?? [];
  const profileMap = new Map((profilesQ.data ?? []).map((p) => [p.id, p]));
  const officeMap = new Map((officesQ.data ?? []).map((o) => [o.id, o.name]));

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (userFilter !== "all" && r.user_id !== userFilter) return false;
      const inHr = new Date(r.check_in_at).getHours();
      const isLate = inHr >= LATE_HOUR;
      const isOpen = !r.check_out_at;
      if (statusFilter === "complete" && isOpen) return false;
      if (statusFilter === "open" && !isOpen) return false;
      if (statusFilter === "late" && !isLate) return false;
      return true;
    });
  }, [rows, userFilter, statusFilter]);

  // Stats
  const totalEmployees = profilesQ.data?.length ?? 0;
  const totalHoursMin = filtered.reduce((a, r) => a + (r.total_minutes ?? 0), 0);
  const openShifts = filtered.filter((r) => !r.check_out_at).length;
  const lateCount = filtered.filter((r) => new Date(r.check_in_at).getHours() >= LATE_HOUR).length;
  const missingOut = filtered.filter(
    (r) => !r.check_out_at && r.work_date < today,
  ).length;

  function exportCsv() {
    const header = ["Date", "Employee", "Email", "Office", "Check-in", "Check-out", "Hours", "Status"];
    const lines = filtered.map((r) => {
      const p = profileMap.get(r.user_id);
      const inHr = new Date(r.check_in_at).getHours();
      const status = !r.check_out_at
        ? r.work_date < today ? "Missing checkout" : "Open"
        : inHr >= LATE_HOUR ? "Late" : "Complete";
      return [
        r.work_date,
        p?.full_name ?? "—",
        p?.email ?? "—",
        r.office_id ? officeMap.get(r.office_id) ?? "—" : "—",
        new Date(r.check_in_at).toLocaleString(),
        r.check_out_at ? new Date(r.check_out_at).toLocaleString() : "",
        r.total_minutes != null ? (r.total_minutes / 60).toFixed(2) : "",
        status,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `attendance_${from}_to_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return null;
  if (role !== "admin") return <Navigate to="/home" />;

  return (
    <div className="px-5 pt-8">
      <header className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
          <p className="text-sm text-muted-foreground">Team attendance overview.</p>
        </div>
        <Link to="/admin/offices">
          <Button variant="outline" size="sm"><Building2 className="mr-2 size-4" />Offices</Button>
        </Link>
      </header>

      {/* Stat cards */}
      <div className="mb-5 grid grid-cols-2 gap-3">
        <Stat icon={<Users2 className="size-4" />} label="Employees" value={String(totalEmployees)} />
        <Stat icon={<Clock className="size-4" />} label="Total hours" value={formatDuration(totalHoursMin)} />
        <Stat icon={<AlertTriangle className="size-4 text-warning" />} label="Late check-ins" value={String(lateCount)} />
        <Stat icon={<AlertTriangle className="size-4 text-destructive" />} label="Missing check-out" value={String(missingOut)} />
      </div>

      {/* Filters */}
      <Card className="mb-4 space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger><SelectValue placeholder="Employee" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All employees</SelectItem>
              {(profilesQ.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
              <SelectItem value="open">Open shift</SelectItem>
              <SelectItem value="late">Late</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={exportCsv} variant="secondary" className="w-full">
          <Download className="mr-2 size-4" /> Export CSV ({filtered.length})
        </Button>
      </Card>

      <div className="space-y-2 pb-6">
        {attQ.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No records match.</p>
        ) : (
          filtered.map((r) => {
            const p = profileMap.get(r.user_id);
            const inHr = new Date(r.check_in_at).getHours();
            const isLate = inHr >= LATE_HOUR;
            const isOpen = !r.check_out_at;
            return (
              <Card key={r.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p?.full_name || p?.email || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {new Date(r.work_date).toLocaleDateString()}
                      {" · "}
                      {new Date(r.check_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {" → "}
                      {r.check_out_at
                        ? new Date(r.check_out_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">{formatDuration(r.total_minutes)}</p>
                    <div className="mt-1 flex justify-end gap-1">
                      {isLate && <Badge tone="warning">Late</Badge>}
                      {isOpen && r.work_date < today && <Badge tone="destructive">Missing</Badge>}
                      {isOpen && r.work_date >= today && <Badge tone="muted">Open</Badge>}
                      {!isOpen && !isLate && <Badge tone="success">OK</Badge>}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
      <p className="mt-1.5 text-xl font-bold tabular-nums">{value}</p>
    </Card>
  );
}

function Badge({ tone, children }: { tone: "success" | "warning" | "destructive" | "muted"; children: React.ReactNode }) {
  const cls = {
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    destructive: "bg-destructive/15 text-destructive",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls}`}>{children}</span>;
}
