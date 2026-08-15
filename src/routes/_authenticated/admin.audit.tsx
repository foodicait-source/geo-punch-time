import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ScrollText } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  head: () => ({
    meta: [
      { title: "Audit log · Geo Attendance" },
      { name: "description", content: "Every admin action on employees, offices and attendance with who did it and when." },
      { property: "og:title", content: "Audit log · Geo Attendance" },
      { property: "og:description", content: "Track admin activity across employees, offices and attendance records." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuditPage,
});

const ENTITIES = ["all", "employee", "office", "attendance"] as const;

function AuditPage() {
  const { role, loading } = useAuth();
  const [entity, setEntity] = useState<(typeof ENTITIES)[number]>("all");

  const q = useQuery({
    queryKey: ["audit", entity],
    enabled: role === "admin",
    queryFn: async () => {
      let query = supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (entity !== "all") query = query.eq("entity_type", entity);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  if (loading) return null;
  if (role !== "admin") return <Navigate to="/home" />;

  const rows = q.data ?? [];

  return (
    <div className="px-5 pt-8">
      <Link to="/admin" className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Back to admin
      </Link>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
        <ScrollText className="size-5 text-primary" /> Audit log
      </h1>
      <p className="mb-5 text-sm text-muted-foreground">Who did what, and when.</p>

      <div className="mb-4">
        <Select value={entity} onValueChange={(v) => setEntity(v as typeof entity)}>
          <SelectTrigger><SelectValue placeholder="Area" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All areas</SelectItem>
            <SelectItem value="employee">Employees</SelectItem>
            <SelectItem value="office">Offices</SelectItem>
            <SelectItem value="attendance">Attendance</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2 pb-6">
        {q.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No admin activity recorded yet.</p>
        ) : (
          rows.map((r) => (
            <Card key={r.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {r.action.replace(/_/g, " ")}
                    {r.entity_label ? ` · ${r.entity_label}` : ""}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{r.actor_email ?? "Unknown admin"}</p>
                  {r.details && Object.keys(r.details as object).length > 0 && (
                    <p className="mt-1 break-words text-[11px] text-muted-foreground">
                      {JSON.stringify(r.details)}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {r.entity_type}
                  </span>
                  <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                    {new Date(r.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
