import { SurfSpot } from "@/lib/db/schema";

export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function findNearestSpot(
  lat: number,
  lng: number,
  spots: SurfSpot[]
): { spot: SurfSpot; distance: number } | null {
  if (spots.length === 0) return null;

  let nearest = spots[0];
  let minDistance = haversineDistance(
    lat,
    lng,
    parseFloat(spots[0].latitude),
    parseFloat(spots[0].longitude)
  );

  for (const spot of spots) {
    const distance = haversineDistance(
      lat,
      lng,
      parseFloat(spot.latitude),
      parseFloat(spot.longitude)
    );
    if (distance < minDistance) {
      minDistance = distance;
      nearest = spot;
    }
  }

  return { spot: nearest, distance: minDistance };
}

/**
 * Distance-based penalty for ranking alerts across spots.
 * No penalty within 20km; gentle decay beyond that with a floor at 0.5.
 * A far-away spot needs significantly higher match quality to outrank a nearby one,
 * but exceptional conditions can still overcome the penalty.
 */
export function getDistancePenalty(distanceKm: number): number {
  const excess = Math.max(0, distanceKm - 20);
  return 0.5 + 0.5 / (1 + excess / 80);
}

/**
 * Rarity boost derived from a spot's profile consistency and quality ceiling.
 * Low consistency + high ceiling = rare epic day → up to ~1.20x boost.
 * High consistency or low ceiling = no boost (floor at 1.0).
 *
 * For spots with multiple profiles, call with the best combo and take the max.
 */
export function getRarityBoost(
  consistency: 'low' | 'medium' | 'high',
  qualityCeiling: number
): number {
  // How rare is it? low = 0.20, medium = 0.05, high = 0
  const consistencyFactor = consistency === 'low' ? 0.20
    : consistency === 'medium' ? 0.05
    : 0;
  // How good is it when it fires? ceiling 2→0, 5→1
  const ceilingFactor = Math.max(0, (qualityCeiling - 2) / 3);
  return 1 + consistencyFactor * ceilingFactor;
}

export function findNearbySpots(
  lat: number,
  lng: number,
  spots: SurfSpot[],
  radiusKm: number = 10
): { spot: SurfSpot; distance: number }[] {
  return spots
    .map((spot) => ({
      spot,
      distance: haversineDistance(
        lat,
        lng,
        parseFloat(spot.latitude),
        parseFloat(spot.longitude)
      ),
    }))
    .filter((s) => s.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance);
}
