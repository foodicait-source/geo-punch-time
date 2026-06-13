import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, Crosshair, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/admin/offices")({
  head: () => ({ meta: [{ title: "Offices · Admin" }] }),
  component: OfficesPage,
});

function OfficesPage() {
  const { role, loading, user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("100");

  const q = useQuery({
    queryKey: ["offices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offices")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const la = parseFloat(lat), lo = parseFloat(lng), r = parseInt(radius, 10);
      if (!name.trim()) throw new Error("Name required");
      if (!Number.isFinite(la) || la < -90 || la > 90) throw new Error("Invalid latitude");
      if (!Number.isFinite(lo) || lo < -180 || lo > 180) throw new Error("Invalid longitude");
      if (!Number.isFinite(r) || r < 10 || r > 10000) throw new Error("Radius 10–10000m");
      const { error } = await supabase.from("offices").insert({
        name: name.trim(), latitude: la, longitude: lo, radius_meters: r, created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Office added");
      setName(""); setLat(""); setLng(""); setRadius("100");
      qc.invalidateQueries({ queryKey: ["offices"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("offices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["offices"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  function useCurrentLocation() {
    if (!navigator.geolocation) return toast.error("Geolocation not available");
    navigator.geolocation.getCurrentPosition(
      (p) => { setLat(p.coords.latitude.toFixed(6)); setLng(p.coords.longitude.toFixed(6)); toast.success("Location filled"); },
      (err) => toast.error(err.message),
      { enableHighAccuracy: true },
    );
  }

  if (loading) return null;
  if (role !== "admin") return <Navigate to="/home" />;

  return (
    <div className="px-5 pt-8">
      <Link to="/admin" className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Back to admin
      </Link>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Office locations</h1>
      <p className="mb-5 text-sm text-muted-foreground">Define where employees can check in.</p>

      <Card className="mb-5 space-y-3 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="HQ" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="lat">Latitude</Label>
            <Input id="lat" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="37.7749" inputMode="decimal" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lng">Longitude</Label>
            <Input id="lng" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-122.4194" inputMode="decimal" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="r">Radius (meters)</Label>
          <Input id="r" type="number" value={radius} onChange={(e) => setRadius(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" type="button" onClick={useCurrentLocation} className="flex-1">
            <Crosshair className="mr-2 size-4" /> Use my location
          </Button>
          <Button onClick={() => add.mutate()} disabled={add.isPending} className="flex-1">
            {add.isPending ? "Adding…" : "Add office"}
          </Button>
        </div>
      </Card>

      <div className="space-y-2 pb-6">
        {(q.data ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No offices yet.</p>
        ) : (
          (q.data ?? []).map((o) => (
            <Card key={o.id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-semibold">{o.name}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {o.latitude.toFixed(5)}, {o.longitude.toFixed(5)} · {o.radius_meters}m
                </p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => del.mutate(o.id)}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
