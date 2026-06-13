import { useMemo } from "react";
import { distanceMeters } from "@/lib/geo";

interface Props {
  officeLat: number;
  officeLng: number;
  radiusMeters: number;
  userLat?: number | null;
  userLng?: number | null;
  className?: string;
}

/**
 * Lightweight SVG mini-map: shows office geofence circle and user position
 * projected with a simple equirectangular approximation.
 */
export function MiniMap({ officeLat, officeLng, radiusMeters, userLat, userLng, className }: Props) {
  const view = useMemo(() => {
    const userDist = userLat != null && userLng != null
      ? distanceMeters(officeLat, officeLng, userLat, userLng)
      : 0;
    // Show area = max(radius * 2.5, userDist * 1.4, 80m) for context
    const halfSpan = Math.max(radiusMeters * 2.5, userDist * 1.4, 80);
    return { halfSpan };
  }, [officeLat, officeLng, radiusMeters, userLat, userLng]);

  const size = 280;
  const scale = (size / 2) / view.halfSpan; // pixels per meter

  function project(lat: number, lng: number) {
    const metersPerDegLat = 111_320;
    const metersPerDegLng = 111_320 * Math.cos((officeLat * Math.PI) / 180);
    const dx = (lng - officeLng) * metersPerDegLng;
    const dy = (lat - officeLat) * metersPerDegLat;
    return { x: size / 2 + dx * scale, y: size / 2 - dy * scale };
  }

  const radiusPx = radiusMeters * scale;
  const user = userLat != null && userLng != null ? project(userLat, userLng) : null;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      style={{ width: "100%", height: "auto", background: "var(--muted)", borderRadius: 16 }}
    >
      {/* grid */}
      <defs>
        <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
          <path d="M 28 0 L 0 0 0 28" fill="none" stroke="var(--border)" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width={size} height={size} fill="url(#grid)" />

      {/* geofence */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radiusPx}
        fill="var(--accent)"
        fillOpacity="0.12"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeDasharray="6 4"
      />
      {/* office */}
      <circle cx={size / 2} cy={size / 2} r={7} fill="var(--primary)" stroke="white" strokeWidth="2" />
      <text x={size / 2 + 12} y={size / 2 + 4} fontSize="11" fill="var(--foreground)" fontWeight="600">
        Office
      </text>

      {/* user */}
      {user && (
        <>
          <circle cx={user.x} cy={user.y} r={14} fill="var(--accent)" fillOpacity="0.2">
            <animate attributeName="r" values="10;18;10" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx={user.x} cy={user.y} r={6} fill="var(--accent)" stroke="white" strokeWidth="2" />
        </>
      )}
    </svg>
  );
}
