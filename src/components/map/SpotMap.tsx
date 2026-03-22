"use client";

import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import Map, { Marker, MapRef, NavigationControl, GeolocateControl, MapMouseEvent, Source, Layer } from "react-map-gl/mapbox";
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
  const [mapMode, setMapMode] = useState<"satellite" | "depth">("satellite");
  const [showLayerPicker, setShowLayerPicker] = useState(false);

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
    return supercluster.getClusters([-180, -90, 180, 90], zoom);
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
      zoom: 15,
      duration: 1000,
      padding: flyToPadding ?? { top: 0, bottom: 0, left: 0, right: 0 },
    });
  }, [flyToPadding]);

  // Fly to the selected spot whenever it changes, or when wizard mode toggles (to re-center without padding)
  useEffect(() => {
    if (selectedSpotId && mapLoaded) {
      const spot = spotById[selectedSpotId];
      if (spot) flyToSpot(spot);
    }
  }, [selectedSpotId, mapLoaded, spotById, flyToSpot, wizardSpotId]);

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
      <GeolocateControl position="bottom-right" trackUserLocation />
      <NavigationControl position="bottom-right" />

      {/* NOAA CUDEM color bathymetry (1/9 arc-second ~3m nearshore) */}
      {mapMode === "depth" && (
        <Source
          id="cudem-color"
          type="raster"
          tiles={[
            "https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_all/ImageServer/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png&f=image&renderingRule=%7B%22rasterFunction%22%3A%22ColorHillshade%22%7D",
          ]}
          tileSize={256}
          attribution="NOAA NCEI CUDEM"
        >
          <Layer
            id="cudem-color-layer"
            type="raster"
            paint={{ "raster-opacity": 1 }}
          />
        </Source>
      )}

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

        // During wizard mode: hide all other spots, show dot for the active spot
        if (wizardSpotId) {
          if (spot.id !== wizardSpotId) return null; // hide other spots
          if (directionEdit) return null; // compass overlay provides the dot
          return (
            <Marker
              key={spot.id}
              longitude={longitude}
              latitude={latitude}
              anchor="center"
            >
              <svg width="12" height="12" viewBox="0 0 12 12">
                <circle cx="6" cy="6" r="6" fill="#E2B714" />
              </svg>
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
                zoom: 15,
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

      {/* Layer picker */}
      <div className="absolute bottom-[148px] right-[10px] z-10">
        <button
          onClick={(e) => { e.stopPropagation(); setShowLayerPicker((v) => !v); }}
          className="mapboxgl-ctrl mapboxgl-ctrl-group"
          title="Map layers"
          style={{ margin: 0, display: "flex", alignItems: "center", justifyContent: "center", width: 29, height: 29 }}
        >
          <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke={showLayerPicker ? "#4264fb" : "#333"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </button>
        {showLayerPicker && (
          <div
            className="absolute bottom-0 right-[39px] bg-white rounded-lg shadow-lg p-2 flex gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {([
              { id: "satellite" as const, label: "Satellite", preview: "bg-slate-800" },
              { id: "depth" as const, label: "Depth", preview: "bg-gradient-to-b from-cyan-400 via-blue-500 to-indigo-900" },
            ]).map((layer) => (
              <button
                key={layer.id}
                onClick={() => { setMapMode(layer.id); setShowLayerPicker(false); }}
                className={`flex flex-col items-center gap-1 group ${mapMode === layer.id ? "opacity-100" : "opacity-70 hover:opacity-100"}`}
              >
                <div
                  className={`w-16 h-16 rounded-md ${layer.preview} ${
                    mapMode === layer.id ? "ring-2 ring-blue-500" : "ring-1 ring-gray-300"
                  }`}
                />
                <span className={`text-[10px] font-medium ${
                  mapMode === layer.id ? "text-blue-600" : "text-gray-600"
                }`}>
                  {layer.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Map>
  );
}
