"use client";

import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import Map, { Marker, MapRef, NavigationControl, GeolocateControl, MapMouseEvent } from "react-map-gl/mapbox";
import Supercluster from "supercluster";
import { SurfSpot } from "@/lib/db/schema";
import SpotMarker from "./SpotMarker";
import MapDirectionOverlay from "./MapDirectionOverlay";
import type { CardinalDirection } from "@/types";
import "mapbox-gl/dist/mapbox-gl.css";

interface SharedSpotMarkerData {
  shareId: string;
  spot: { id: string; name: string; latitude: string; longitude: string };
  sharedBy: { id: string; name: string | null };
}

interface SpotMapProps {
  spots: SurfSpot[];
  onSpotClick?: (spot: SurfSpot) => void;
  onMapClick?: (lat: number, lng: number) => void;
  selectedSpotId?: string;
  interactive?: boolean;
  newSpotMarker?: { lat: number; lng: number } | null;
  initialViewState?: {
    longitude: number;
    latitude: number;
    zoom: number;
  };
  /** Extra padding (px) passed to flyTo so the spot centers in the visible area */
  flyToPadding?: { top?: number; bottom?: number; left?: number; right?: number };
  /** Set of spot IDs that have active alerts */
  alertSpotIds?: Set<string>;
  /** Shared spots from other users */
  sharedSpots?: SharedSpotMarkerData[];
  /** Callback when a shared spot marker is clicked */
  onSharedSpotClick?: (sharedSpot: SharedSpotMarkerData) => void;
  /** Direction editing overlay state */
  directionEdit?: {
    spotId: string;
    selected: CardinalDirection[];
    mode: "target" | "exclusion";
    onChange: (dirs: CardinalDirection[]) => void;
  } | null;
  /** When set, replaces the normal marker for this spot with a minimal white dot */
  wizardSpotId?: string;
}

const DEFAULT_VIEW_STATE = {
  longitude: -122.4,
  latitude: 37.8,
  zoom: 9,
};

type SpotProperties = { spotId: string };
type SpotFeature = Supercluster.PointFeature<SpotProperties>;

export default function SpotMap({
  spots,
  onSpotClick,
  onMapClick,
  selectedSpotId,
  interactive = true,
  newSpotMarker,
  initialViewState = DEFAULT_VIEW_STATE,
  flyToPadding,
  alertSpotIds,
  sharedSpots,
  onSharedSpotClick,
  directionEdit,
  wizardSpotId,
}: SpotMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [viewState, setViewState] = useState(initialViewState);
  const [mapLoaded, setMapLoaded] = useState(false);

  const spotById = useMemo(() => {
    const lookup: Record<string, SurfSpot> = {};
    spots.forEach((s) => { lookup[s.id] = s; });
    return lookup;
  }, [spots]);

  const points: SpotFeature[] = useMemo(
    () =>
      spots.map((spot) => ({
        type: "Feature" as const,
        properties: { spotId: spot.id },
        geometry: {
          type: "Point" as const,
          coordinates: [parseFloat(spot.longitude), parseFloat(spot.latitude)],
        },
      })),
    [spots]
  );

  const supercluster = useMemo(() => {
    const sc = new Supercluster<SpotProperties>({
      radius: 60,
      maxZoom: 16,
    });
    sc.load(points);
    return sc;
  }, [points]);

  const clusters = useMemo(() => {
    const zoom = Math.floor(viewState.zoom ?? 9);
    const map = mapRef.current?.getMap();
    if (!map) {
      // Before map loads, use world bounds so points are still clustered
      return supercluster.getClusters([-180, -90, 180, 90], zoom);
    }
    const bounds = map.getBounds();
    if (!bounds) return [];
    const bbox: [number, number, number, number] = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ];
    return supercluster.getClusters(bbox, zoom);
  }, [supercluster, viewState.zoom, viewState.longitude, viewState.latitude, points, mapLoaded]);

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
      zoom: 14,
      duration: 1000,
      padding: flyToPadding,
    });
  }, [flyToPadding]);

  // Fly to the selected spot whenever it changes (e.g. from banner clicks, not just marker clicks)
  useEffect(() => {
    if (selectedSpotId && mapLoaded) {
      const spot = spotById[selectedSpotId];
      if (spot) flyToSpot(spot);
    }
  }, [selectedSpotId, mapLoaded, spotById, flyToSpot]);

  const handleClusterClick = useCallback(
    (clusterId: number, longitude: number, latitude: number) => {
      const zoom = supercluster.getClusterExpansionZoom(clusterId);
      mapRef.current?.flyTo({
        center: [longitude, latitude],
        zoom,
        duration: 500,
      });
    },
    [supercluster]
  );

  return (
    <Map
      ref={mapRef}
      {...viewState}
      onLoad={() => setMapLoaded(true)}
      onMove={(evt) => setViewState(evt.viewState)}
      onClick={handleMapClick}
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      mapStyle="mapbox://styles/mapbox/satellite-v9"
      style={{ width: "100%", height: "100%" }}
      cursor={interactive && onMapClick ? "crosshair" : "grab"}
    >
      <NavigationControl position="bottom-right" />
      <GeolocateControl position="bottom-right" trackUserLocation />

      {/* Spots and clusters */}
      {clusters.map((cluster) => {
        const [longitude, latitude] = cluster.geometry.coordinates;
        const props = cluster.properties;

        if ("cluster" in props && props.cluster) {
          const count = props.point_count;
          const size = count < 10 ? 36 : count < 50 ? 44 : 52;
          const clusterHasAlert = alertSpotIds && alertSpotIds.size > 0 &&
            supercluster.getLeaves(cluster.id as number, Infinity).some(
              (leaf) => alertSpotIds.has(leaf.properties.spotId)
            );
          return (
            <Marker
              key={`cluster-${cluster.id}`}
              longitude={longitude}
              latitude={latitude}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                handleClusterClick(cluster.id as number, longitude, latitude);
              }}
            >
              <div className="relative">
                {clusterHasAlert && (
                  <div className="absolute -top-0.5 -right-0.5 z-10">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 border border-white" />
                  </div>
                )}
                <div
                  className="bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-sm drop-shadow-lg cursor-pointer hover:scale-110 transition-transform border-2 border-white"
                  style={{ width: size, height: size }}
                >
                  {count}
                </div>
              </div>
            </Marker>
          );
        }

        // Individual spot
        const spot = spotById[(props as SpotProperties).spotId];
        if (!spot) return null;

        // During wizard mode, show a minimal white dot instead of the full marker
        if (wizardSpotId === spot.id) {
          return (
            <Marker
              key={spot.id}
              longitude={longitude}
              latitude={latitude}
              anchor="center"
            >
              <div className="w-3 h-3 rounded-full bg-white border-2 border-white/60 shadow-lg" />
            </Marker>
          );
        }

        return (
          <Marker
            key={spot.id}
            longitude={longitude}
            latitude={latitude}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              handleSpotClick(e.originalEvent as unknown as React.MouseEvent, spot);
              flyToSpot(spot);
            }}
          >
            <SpotMarker spot={spot} isSelected={selectedSpotId === spot.id} hasAlert={alertSpotIds?.has(spot.id)} />
          </Marker>
        );
      })}

      {/* Shared spot markers */}
      {sharedSpots?.map((shared) => {
        const lng = parseFloat(shared.spot.longitude);
        const lat = parseFloat(shared.spot.latitude);
        return (
          <Marker
            key={`shared-${shared.shareId}`}
            longitude={lng}
            latitude={lat}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              if (onSharedSpotClick) onSharedSpotClick(shared);
              mapRef.current?.flyTo({
                center: [lng, lat],
                zoom: 14,
                duration: 1000,
                padding: flyToPadding,
              });
            }}
          >
            <div className="relative group cursor-pointer">
              <svg
                className="w-8 h-8 drop-shadow-lg transition-all duration-200 ease-in-out text-blue-500 hover:scale-110"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-background border rounded-md shadow-lg whitespace-nowrap text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                {shared.spot.name}
                <span className="text-xs text-muted-foreground ml-1">(shared)</span>
              </div>
            </div>
          </Marker>
        );
      })}

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
              <span className="text-white text-lg leading-none flex items-center justify-center">+</span>
            </div>
          </div>
        </Marker>
      )}

      {/* Direction editing overlay */}
      {directionEdit && (() => {
        const spot = spotById[directionEdit.spotId];
        if (!spot) return null;
        return (
          <MapDirectionOverlay
            longitude={parseFloat(spot.longitude)}
            latitude={parseFloat(spot.latitude)}
            selected={directionEdit.selected}
            onChange={directionEdit.onChange}
            mode={directionEdit.mode}
          />
        );
      })()}
    </Map>
  );
}
