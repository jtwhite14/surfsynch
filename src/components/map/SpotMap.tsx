"use client";

import { useRef, useState, useCallback, useMemo } from "react";
import Map, { Marker, MapRef, NavigationControl, GeolocateControl, MapMouseEvent } from "react-map-gl/mapbox";
import Supercluster from "supercluster";
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
  initialViewState?: {
    longitude: number;
    latitude: number;
    zoom: number;
  };
  /** Extra padding (px) passed to flyTo so the spot centers in the visible area */
  flyToPadding?: { top?: number; bottom?: number; left?: number; right?: number };
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
      zoom: 12,
      duration: 1000,
      padding: flyToPadding,
    });
  }, [flyToPadding]);

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
              <div
                className="bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-sm drop-shadow-lg cursor-pointer hover:scale-110 transition-transform border-2 border-white"
                style={{ width: size, height: size }}
              >
                {count}
              </div>
            </Marker>
          );
        }

        // Individual spot
        const spot = spotById[(props as SpotProperties).spotId];
        if (!spot) return null;
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
            <SpotMarker spot={spot} isSelected={selectedSpotId === spot.id} />
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
              <span className="text-white text-lg">+</span>
            </div>
          </div>
        </Marker>
      )}
    </Map>
  );
}
