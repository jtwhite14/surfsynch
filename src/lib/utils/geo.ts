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
