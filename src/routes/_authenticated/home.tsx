import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, LogIn, LogOut, MapPin, Clock, ShieldCheck, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { distanceMeters, formatDuration } from "@/lib/geo";
import { getDeviceId } from "@/lib/device-id";
import { MiniMap } from "@/components/MiniMap";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({ meta: [{ title: "Check in · Geo Attendance" }] }),
  component: HomePage,
});

interface Office {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

interface LocState {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

function useLiveLocation() {
  const [loc, setLoc] = useState<LocState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Geolocation not supported in this browser.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setError(null);
        setLoc({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        });
      },
      (err) => setError(err.message || "Location permission denied"),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  return { loc, error };
}

function HomePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { loc, error: locErr } = useLiveLocation();

  const officesQ = useQuery({
    queryKey: ["offices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offices")
        .select("id,name,latitude,longitude,radius_meters")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Office[];
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const todayQ = useQuery({
    queryKey: ["attendance", "today", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .eq("user_id", user!.id)
        .eq("work_date", today)
        .order("check_in_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // pick nearest office
  const nearest = useMemo(() => {
    const list = officesQ.data ?? [];
    if (list.length === 0 || !loc) return list[0] ?? null;
    return [...list]
      .map((o) => ({ o, d: distanceMeters(loc.lat, loc.lng, o.latitude, o.longitude) }))
      .sort((a, b) => a.d - b.d)[0]?.o ?? null;
  }, [officesQ.data, loc]);

  const distance = useMemo(() => {
    if (!nearest || !loc) return null;
    return distanceMeters(loc.lat, loc.lng, nearest.latitude, nearest.longitude);
  }, [nearest, loc]);

  const inside = distance != null && nearest ? distance <= nearest.radius_meters : false;
  const openShift = todayQ.data && !todayQ.data.check_out_at ? todayQ.data : null;

  const checkIn = useMutation({
    mutationFn: async () => {
      if (!loc || !nearest) throw new Error("Location not available");
      if (!inside) throw new Error("You are outside the geofence");
      const { error } = await supabase.from("attendance").insert({
        user_id: user!.id,
        office_id: nearest.id,
        work_date: today,
        check_in_at: new Date().toISOString(),
        check_in_lat: loc.lat,
        check_in_lng: loc.lng,
        device_id: getDeviceId(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Checked in");
      qc.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Check-in failed"),
  });

  const checkOut = useMutation({
    mutationFn: async () => {
      if (!loc) throw new Error("Location not available");
      if (!openShift) throw new Error("No open shift");
      if (!inside) throw new Error("You are outside the geofence");
      const { error } = await supabase
        .from("attendance")
        .update({
          check_out_at: new Date().toISOString(),
          check_out_lat: loc.lat,
          check_out_lng: loc.lng,
        })
        .eq("id", openShift.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Checked out");
      qc.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Check-out failed"),
  });

  const offices = officesQ.data ?? [];

  return (
    <div className="px-5 pt-8">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          Hi, {user?.user_metadata?.full_name?.split(" ")[0] ?? user?.email?.split("@")[0]}
        </h1>
      </header>

      {/* Status pill */}
      <div className="mb-5 flex items-center justify-between rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          {inside ? (
            <ShieldCheck className="size-5 text-success" />
          ) : (
            <ShieldAlert className="size-5 text-warning" />
          )}
          <div>
            <p className="text-sm font-semibold">{inside ? "Inside office" : "Outside office"}</p>
            <p className="text-xs text-muted-foreground">
              {locErr
                ? locErr
                : !loc
                  ? "Getting your location…"
                  : distance == null
                    ? "No office configured"
                    : `${Math.round(distance)} m from ${nearest?.name}`}
            </p>
          </div>
        </div>
        <span
          className={`inline-flex size-2.5 rounded-full ${
            inside ? "bg-success animate-pulse" : "bg-warning"
          }`}
        />
      </div>

      {/* Map */}
      {nearest ? (
        <Card className="mb-5 overflow-hidden p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Building2 className="size-4 text-primary" />
            {nearest.name}
            <span className="ml-auto text-xs text-muted-foreground">
              radius {nearest.radius_meters}m
            </span>
          </div>
          <MiniMap
            officeLat={nearest.latitude}
            officeLng={nearest.longitude}
            radiusMeters={nearest.radius_meters}
            userLat={loc?.lat}
            userLng={loc?.lng}
          />
        </Card>
      ) : offices.length === 0 ? (
        <Card className="mb-5 p-5 text-sm text-muted-foreground">
          No office locations yet. Ask your admin to add one.
        </Card>
      ) : null}

      {/* Today shift */}
      <Card className="mb-5 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Clock className="size-4 text-primary" />
          Today
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xs text-muted-foreground">In</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {todayQ.data?.check_in_at
                ? new Date(todayQ.data.check_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Out</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {todayQ.data?.check_out_at
                ? new Date(todayQ.data.check_out_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {formatDuration(todayQ.data?.total_minutes ?? null)}
            </p>
          </div>
        </div>
      </Card>

      {/* Big CTA */}
      <div className="mt-6">
        {openShift ? (
          <Button
            size="lg"
            variant="destructive"
            className="ring-soft h-20 w-full rounded-3xl text-base font-semibold"
            disabled={!inside || checkOut.isPending}
            onClick={() => checkOut.mutate()}
          >
            <LogOut className="mr-2 size-5" />
            {checkOut.isPending ? "Checking out…" : "Check out"}
          </Button>
        ) : todayQ.data?.check_out_at ? (
          <div className="rounded-3xl border border-border bg-card p-5 text-center text-sm text-muted-foreground">
            You've already completed today's shift. See you tomorrow!
          </div>
        ) : (
          <Button
            size="lg"
            className="gradient-primary ring-soft h-20 w-full rounded-3xl text-base font-semibold text-primary-foreground"
            disabled={!inside || checkIn.isPending || !nearest}
            onClick={() => checkIn.mutate()}
          >
            <LogIn className="mr-2 size-5" />
            {checkIn.isPending ? "Checking in…" : "Check in"}
          </Button>
        )}
        {!inside && nearest && (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <MapPin className="size-3.5" />
            Move within {nearest.radius_meters}m of {nearest.name} to enable.
          </p>
        )}
      </div>
    </div>
  );
}
