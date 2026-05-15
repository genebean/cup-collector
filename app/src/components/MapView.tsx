"use client";

// MapView must be imported with `dynamic(() => ..., { ssr: false })` because
// Leaflet directly accesses the browser DOM and will crash during server-side
// rendering. See app/src/app/map/page.tsx for the dynamic import.

import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, useMapEvents } from "react-leaflet";
import type { CupWithOwnership, NearbyStore } from "@/types";
import { useRouter } from "next/navigation";
import { useUiTheme } from "@/hooks/useUiTheme";
import { MapBottomSheet } from "@/components/MapBottomSheet";

const TILES = {
  light: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
};

interface MapViewProps {
  cups: CupWithOwnership[];
  stores: NearbyStore[];
  userLocation: { lat: number; lng: number } | null;
  targetZoom: number;
  worldViewTick?: number;
}

// Flies to user location on first acquisition
function LocationUpdater({ location, zoom }: { location: { lat: number; lng: number } | null; zoom: number }) {
  const map = useMap();
  const hasFlownTo = useRef(false);

  useEffect(() => {
    if (location && !hasFlownTo.current) {
      map.flyTo([location.lat, location.lng], zoom, { duration: 1.5 });
      hasFlownTo.current = true;
    }
  }, [location, zoom, map]);

  return null;
}

// Flies to the world overview when the globe button is pressed
function WorldViewResetter({ tick }: { tick: number }) {
  const map = useMap();
  useEffect(() => {
    if (tick > 0) {
      map.flyTo([20, 0], 2, { duration: 1.5 });
    }
  }, [tick, map]);
  return null;
}

// Listens to Leaflet map events and reports which cups fall within the current viewport
function BoundsTracker({
  cups,
  onVisibleCupsChange,
}: {
  cups: CupWithOwnership[];
  onVisibleCupsChange: (cups: CupWithOwnership[]) => void;
}) {
  const map = useMapEvents({
    moveend() {
      const bounds = map.getBounds();
      onVisibleCupsChange(cups.filter((c) => bounds.contains([c.lat, c.lng])));
    },
  });

  // Re-filter whenever the cups data changes (initial load, real-time updates)
  useEffect(() => {
    const bounds = map.getBounds();
    onVisibleCupsChange(cups.filter((c) => bounds.contains([c.lat, c.lng])));
  }, [cups, map, onVisibleCupsChange]);

  return null;
}

// Adjusts zoom when the radius chip changes (only when a location is active)
function ZoomUpdater({ location, zoom }: { location: { lat: number; lng: number } | null; zoom: number }) {
  const map = useMap();
  const prevZoom = useRef<number | null>(null);

  useEffect(() => {
    if (!location) return;
    if (prevZoom.current === null) {
      prevZoom.current = zoom;
      return;
    }
    if (zoom !== prevZoom.current) {
      prevZoom.current = zoom;
      map.flyTo([location.lat, location.lng], zoom, { duration: 1 });
    }
  }, [zoom, location, map]);

  return null;
}

export default function MapView({ cups, stores, userLocation, targetZoom, worldViewTick = 0 }: MapViewProps) {
  const router = useRouter();
  const { isDark } = useUiTheme();
  const tiles = isDark ? TILES.dark : TILES.light;
  const [visibleCups, setVisibleCups] = useState<CupWithOwnership[]>([]);
  const handleVisibleCupsChange = useCallback((c: CupWithOwnership[]) => setVisibleCups(c), []);

  // Default world view when no location is available
  const defaultCenter: [number, number] = [20, 0];
  const defaultZoom = 2;

  return (
    <div className="relative w-full h-full">
    <MapContainer
      center={defaultCenter}
      zoom={defaultZoom}
      className="w-full h-full"
      attributionControl={true}
    >
      {/* key forces a remount when switching so stale tiles don't linger */}
      <TileLayer key={isDark ? "dark" : "light"} attribution={tiles.attribution} url={tiles.url} />

      <LocationUpdater location={userLocation} zoom={targetZoom} />
      <ZoomUpdater location={userLocation} zoom={targetZoom} />
      <WorldViewResetter tick={worldViewTick} />
      <BoundsTracker cups={cups} onVisibleCupsChange={handleVisibleCupsChange} />

      {/* "You are here" — white dot with blue ring */}
      {userLocation && (
        <CircleMarker
          center={[userLocation.lat, userLocation.lng]}
          radius={9}
          pathOptions={{
            color: "#1d4ed8",
            fillColor: "white",
            fillOpacity: 1,
            weight: 3,
          }}
        >
          <Popup>You are here</Popup>
        </CircleMarker>
      )}

      {/* Cup pins:
            green  = owned and in good condition
            orange = unowned OR owned but needs replacing (both are action items) */}
      {cups.map((cup) => {
        const needsReplacing = cup.isOwned && cup.ownedRecord?.needs_replacing;
        // A cup that needs replacing is visually treated like an unowned cup so
        // it stands out as something that requires action.
        const isGreen = cup.isOwned && !needsReplacing;
        return (
          <CircleMarker
            key={cup.id}
            center={[cup.lat, cup.lng]}
            radius={7}
            pathOptions={{
              color: isGreen ? "#00704A" : "#ea580c",
              fillColor: isGreen ? "#00704A" : "#f97316",
              fillOpacity: 0.85,
              weight: 2,
            }}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">{cup.city}</div>
                <div className="text-gray-500">{cup.series} · {cup.year}</div>
                <div className={isGreen ? "text-green-700 mb-1" : "text-orange-600 mb-1"}>
                  {needsReplacing ? "⚠ Needs replacing" : cup.isOwned ? "✓ Owned" : "Needed"}
                </div>
                <button
                  onClick={() => router.push(`/cup/${cup.id}`)}
                  className="text-green-700 underline text-xs"
                >
                  View details →
                </button>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      {/* Nearby Starbucks pins — blue — tap shows popup with directions link */}
      {stores.map((store) => (
        <CircleMarker
          key={store.place_id}
          center={[store.lat, store.lng]}
          radius={6}
          pathOptions={{
            color: "#1d4ed8",
            fillColor: "#3b82f6",
            fillOpacity: 0.9,
            weight: 2,
          }}
        >
          <Popup>
            <div className="text-sm">
              <div className="font-semibold">☕ {store.name}</div>
              <div className="text-gray-500 text-xs">{store.address}</div>
              <a
                href={`https://maps.apple.com/?daddr=${store.lat},${store.lng}&dirflg=d`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 text-xs underline"
              >
                Get directions →
              </a>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
    <MapBottomSheet cups={visibleCups} />
    </div>
  );
}
