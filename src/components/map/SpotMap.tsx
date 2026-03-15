"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Map, { Marker, MapRef, NavigationControl, GeolocateControl, MapMouseEvent } from "react-map-gl/mapbox";
import mapboxgl from "mapbox-gl";
import { SurfSpot } from "@/lib/db/schema";
import SpotMarker from "./SpotMarker";
import "mapbox-gl/dist/mapbox-gl.css";

interface SpotMapProps {
  spots: SurfSpot[];
  onSpotClick?: (spot: SurfSpot) => void;
  onMapClick?: (lat: number, lng: number) => void;
  selectedSpotId?: string;
  interactive?: boolean;
  newSpotMarker?: { lat: number; lng: number } | null;
  fitToSpots?: boolean;
  initialViewState?: {
    longitude: number;
    latitude: number;
    zoom: number;
  };
}

const DEFAULT_VIEW_STATE = {
  longitude: -122.4,
  latitude: 37.8,
  zoom: 9,
};

export default function SpotMap({
  spots,
  onSpotClick,
  onMapClick,
  selectedSpotId,
  interactive = true,
  newSpotMarker,
  fitToSpots = false,
  initialViewState = DEFAULT_VIEW_STATE,
}: SpotMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [viewState, setViewState] = useState(initialViewState);
  const hasFitted = useRef(false);

  useEffect(() => {
    if (!fitToSpots || hasFitted.current || !mapRef.current || spots.length === 0) return;
    hasFitted.current = true;

    if (spots.length === 1) {
      mapRef.current.flyTo({
        center: [parseFloat(spots[0].longitude), parseFloat(spots[0].latitude)],
        zoom: 12,
        duration: 1000,
      });
    } else {
      const bounds = new mapboxgl.LngLatBounds();
      spots.forEach((spot) => {
        bounds.extend([parseFloat(spot.longitude), parseFloat(spot.latitude)]);
      });
      mapRef.current.fitBounds(bounds, { padding: 80, maxZoom: 13, duration: 1000 });
    }
  }, [fitToSpots, spots]);

  const handleMapClick = useCallback(
    (event: MapMouseEvent) => {
      if (onMapClick && interactive) {
        const { lng, lat } = event.lngLat;
        onMapClick(lat, lng);
      }
    },
    [onMapClick, interactive]
  );

  const handleSpotClick = useCallback(
    (e: React.MouseEvent, spot: SurfSpot) => {
      e.stopPropagation();
      if (onSpotClick) {
        onSpotClick(spot);
      }
    },
    [onSpotClick]
  );

  const flyToSpot = useCallback((spot: SurfSpot) => {
    mapRef.current?.flyTo({
      center: [parseFloat(spot.longitude), parseFloat(spot.latitude)],
      zoom: 12,
      duration: 1000,
    });
  }, []);

  return (
    <Map
      ref={mapRef}
      {...viewState}
      onMove={(evt) => setViewState(evt.viewState)}
      onClick={handleMapClick}
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      mapStyle="mapbox://styles/mapbox/satellite-v9"
      style={{ width: "100%", height: "100%" }}
      cursor={interactive && onMapClick ? "crosshair" : "grab"}
    >
      <NavigationControl position="top-right" />
      <GeolocateControl position="top-right" trackUserLocation />

      {/* Existing spots */}
      {spots.map((spot) => (
        <Marker
          key={spot.id}
          longitude={parseFloat(spot.longitude)}
          latitude={parseFloat(spot.latitude)}
          anchor="bottom"
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            handleSpotClick(e.originalEvent as unknown as React.MouseEvent, spot);
            flyToSpot(spot);
          }}
        >
          <SpotMarker
            spot={spot}
            isSelected={selectedSpotId === spot.id}
          />
        </Marker>
      ))}

      {/* New spot marker (when adding) */}
      {newSpotMarker && (
        <Marker
          longitude={newSpotMarker.lng}
          latitude={newSpotMarker.lat}
          anchor="bottom"
        >
          <div className="relative">
            <div className="absolute -inset-2 bg-blue-500/30 rounded-full animate-ping" />
            <div className="w-8 h-8 bg-blue-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center">
              <span className="text-white text-lg">+</span>
            </div>
          </div>
        </Marker>
      )}
    </Map>
  );
}
