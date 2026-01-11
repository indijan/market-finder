"use client";

import { useMemo, useRef, useState } from "react";
import { Circle, GoogleMap, InfoWindow, Marker, useJsApiLoader } from "@react-google-maps/api";
import type { MarketSummary } from "@/lib/types";

const TYPE_COLORS: Record<string, string> = {
  farmers: "#3dd68c",
  night: "#ffae2b",
  craft: "#6aa9ff",
  flea: "#ff7aa0",
  other: "#c7ced6",
};

export const MapView = ({
  center,
  markets,
  radiusKm,
  onCenterChange,
  returnTo,
}: {
  center: { lat: number; lng: number };
  markets: MarketSummary[];
  radiusKm: number;
  onCenterChange?: (center: { lat: number; lng: number }) => void;
  returnTo: string;
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const lastCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
  });

  const markers = useMemo(
    () =>
      markets.map((market) => ({
        ...market,
        lat: market.lat ?? center.lat,
        lng: market.lng ?? center.lng,
      })),
    [markets, center.lat, center.lng]
  );

  if (!isLoaded) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-slate-200/70">
        Loading map...
      </div>
    );
  }
  const selected = markers.find((market) => market.id === selectedId) || null;

  return (
    <GoogleMap
      mapContainerClassName="h-full w-full"
      center={center}
      zoom={11}
      onLoad={(map) => {
        mapRef.current = map;
      }}
      onIdle={(map) => {
        if (!onCenterChange) return;
        const mapInstance = map ?? mapRef.current;
        if (!mapInstance) return;
        const nextCenter = mapInstance.getCenter();
        if (!nextCenter) return;
        const next = { lat: nextCenter.lat(), lng: nextCenter.lng() };
        const last = lastCenterRef.current;
        if (last) {
          const deltaLat = Math.abs(next.lat - last.lat);
          const deltaLng = Math.abs(next.lng - last.lng);
          if (deltaLat < 0.005 && deltaLng < 0.005) {
            return;
          }
        }
        lastCenterRef.current = next;
        onCenterChange(next);
      }}
      options={{
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
        zoomControl: true,
        styles: [
          {
            featureType: "poi",
            stylers: [{ visibility: "off" }],
          },
        ],
      }}
    >
      <Circle
        center={center}
        radius={radiusKm * 1000}
        options={{
          strokeColor: "#2de0b3",
          strokeOpacity: 0.6,
          strokeWeight: 1,
          fillColor: "#2de0b3",
          fillOpacity: 0.08,
        }}
      />
      {markers.map((market) => (
        <Marker
          key={market.id}
          position={{ lat: market.lat as number, lng: market.lng as number }}
          icon={{
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: TYPE_COLORS[market.market_type ?? "other"],
            fillOpacity: 0.9,
            strokeColor: "#0b0f16",
            strokeWeight: 1.5,
            scale: 6,
          }}
          onClick={() => setSelectedId(market.id)}
        />
      ))}
      {selected ? (
        <InfoWindow
          position={{ lat: selected.lat as number, lng: selected.lng as number }}
          onCloseClick={() => setSelectedId(null)}
        >
          <div>
            <div className="text-sm font-semibold text-slate-900">{selected.name}</div>
            {selected.city ? <div className="text-xs text-slate-700">{selected.city}</div> : null}
            <a
              className="text-xs text-blue-700"
              href={`/markets/${selected.id}?return=${encodeURIComponent(returnTo)}`}
            >
              View details
            </a>
          </div>
        </InfoWindow>
      ) : null}
    </GoogleMap>
  );
};
