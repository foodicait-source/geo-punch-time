import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, Shield, ShieldOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/admin/employees")({
  head: () => ({
    meta: [
      { title: "Employees · Geo Attendance" },
      { name: "description", content: "Manage employee accounts and administrator access for attendance tracking." },
      { property: "og:title", content: "Employees · Geo Attendance" },
      { property: "og:description", content: "Manage employee accounts and administrator access." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EmployeesPage,
});

function EmployeesPage() {
  const { role, loading, user } = useAuth();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["admin", "employees"],
    enabled: role === "admin",
    queryFn: async () => {
      const [{ data: profiles, error: pe }, { data: roles, error: re }] = await Promise.all([
        supabase.from("profiles").select("id,full_name,email,created_at").order("created_at"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      if (pe) throw pe;
      if (re) throw re;
      const adminIds = new Set((roles ?? []).filter((r) => r.role === "admin").map((r) => r.user_id));
      return (profiles ?? []).map((p) => ({ ...p, isAdmin: adminIds.has(p.id) }));
    },
  });

  const toggle = useMutation({
    mutationFn: async (p: { id: string; isAdmin: boolean; label: string }) => {
      if (p.isAdmin) {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", p.id).eq("role", "admin");
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_roles").insert({ user_id: p.id, role: "admin" });
        if (error) throw error;
      }
      await logAudit({
        action: p.isAdmin ? "revoke_admin_role" : "grant_admin_role",
        entityType: "employee",
        entityId: p.id,
        entityLabel: p.label,
      });
    },
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["admin", "employees"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (loading) return null;
  if (role !== "admin") return <Navigate to="/home" />;

  return (
    <div className="px-5 pt-8">
      <Link to="/admin" className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Back to admin
      </Link>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Employees</h1>
      <p className="mb-5 text-sm text-muted-foreground">Grant or revoke administrator access.</p>

      <div className="space-y-2 pb-6">
        {q.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (q.data ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No employees yet.</p>
        ) : (
          (q.data ?? []).map((p) => {
            const label = p.full_name || p.email || p.id;
            return (
              <Card key={p.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.email} · {p.isAdmin ? "Admin" : "Employee"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={p.isAdmin ? "outline" : "secondary"}
                  disabled={toggle.isPending || p.id === user?.id}
                  onClick={() => toggle.mutate({ id: p.id, isAdmin: p.isAdmin, label })}
                >
                  {p.isAdmin ? <ShieldOff className="mr-1.5 size-4" /> : <Shield className="mr-1.5 size-4" />}
                  {p.isAdmin ? "Revoke" : "Make admin"}
                </Button>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
