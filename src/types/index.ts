// Open-Meteo Marine API types
export interface MarineConditions {
  waveHeight: number | null;
  wavePeriod: number | null;
  waveDirection: number | null;
  primarySwellHeight: number | null;
  primarySwellPeriod: number | null;
  primarySwellDirection: number | null;
  secondarySwellHeight: number | null;
  secondarySwellPeriod: number | null;
  secondarySwellDirection: number | null;
  windWaveHeight: number | null;
  windWavePeriod: number | null;
  windWaveDirection: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  windGust: number | null;
  airTemp: number | null;
  seaSurfaceTemp: number | null;
  humidity: number | null;
  precipitation: number | null;
  pressureMsl: number | null;
  cloudCover: number | null;
  visibility: number | null;
  tideHeight: number | null;
  weatherCode: number | null;
  isDay: boolean | null;
  timestamp: Date;
}

export interface HourlyForecast extends MarineConditions {
  time: string;
}

export interface ForecastData {
  latitude: number;
  longitude: number;
  hourly: HourlyForecast[];
  utcOffsetSeconds: number;
  fetchedAt: Date;
}

// Calendar types
export interface CalendarEvent {
  id: string;
  summary: string;
  start: Date;
  end: Date;
  allDay: boolean;
}

export interface AvailabilityWindow {
  start: Date;
  end: Date;
  duration: number; // in minutes
}

// Condition weight configuration per spot
export interface ConditionWeights {
  swellHeight: number;    // 0-1
  swellPeriod: number;    // 0-1
  swellDirection: number; // 0-1
  tideHeight: number;     // 0-1
  windSpeed: number;      // 0-1
  windDirection: number;  // 0-1
  preferredTide: 'any' | 'low' | 'mid' | 'high' | 'incoming' | 'outgoing';
  notes?: string;
}

export const DEFAULT_CONDITION_WEIGHTS: ConditionWeights = {
  swellHeight: 0.8,
  swellPeriod: 0.7,
  swellDirection: 0.9,
  tideHeight: 0.5,
  windSpeed: 0.7,
  windDirection: 0.6,
  preferredTide: 'any',
};

// Weight presets for common spot types
export const WEIGHT_PRESETS: Record<string, { label: string; weights: Partial<ConditionWeights> }> = {
  allAround: {
    label: "All-around",
    weights: { swellHeight: 0.8, swellPeriod: 0.7, swellDirection: 0.9, tideHeight: 0.5, windSpeed: 0.7, windDirection: 0.6, preferredTide: 'any' },
  },
  reefBreak: {
    label: "Reef break",
    weights: { swellHeight: 0.7, swellPeriod: 0.9, swellDirection: 1.0, tideHeight: 0.9, windSpeed: 0.8, windDirection: 0.7, preferredTide: 'low' },
  },
  beachBreak: {
    label: "Beach break",
    weights: { swellHeight: 0.9, swellPeriod: 0.6, swellDirection: 0.7, tideHeight: 0.4, windSpeed: 0.9, windDirection: 0.7, preferredTide: 'any' },
  },
  pointBreak: {
    label: "Point break",
    weights: { swellHeight: 0.7, swellPeriod: 0.8, swellDirection: 1.0, tideHeight: 0.6, windSpeed: 0.7, windDirection: 0.8, preferredTide: 'mid' },
  },
};

// Per-variable match detail
export interface MatchDetails {
  swellHeight: number | null;    // 0-1 similarity
  swellPeriod: number | null;
  swellDirection: number | null;
  tideHeight: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  coverage: number;              // fraction of variables that were non-null
  ratingBoost: number;           // multiplier from session rating
  forecastConfidence: number;    // decay factor from days out
}

// Prediction types
export interface ConditionMatch {
  sessionId: string;
  sessionDate: Date;
  rating: number;
  spotName: string;
  matchScore: number; // 0-100 raw similarity
  effectiveScore: number; // after rating boost + forecast confidence
  matchDetails: MatchDetails;
}

export type TimeWindow = 'dawn' | 'midday' | 'afternoon';

export interface SpotAlertResponse {
  id: string;
  spotId: string;
  spotName: string;
  forecastHour: Date;
  timeWindow: TimeWindow;
  matchScore: number;
  confidenceScore: number;
  effectiveScore: number;
  matchedSession: {
    id: string;
    date: Date;
    rating: number;
    notes: string | null;
    photoUrl: string | null;
  };
  matchDetails: MatchDetails;
  forecastSnapshot: MarineConditions;
  status: 'active' | 'dismissed' | 'expired' | 'confirmed';
}

export interface SurfPrediction {
  spotId: string;
  spotName: string;
  timestamp: Date;
  conditions: MarineConditions;
  similarSessions: ConditionMatch[];
  confidence: number; // 0-100 based on number of similar sessions
  isGoldenWindow: boolean; // matches good session AND user available
  availabilityWindow?: AvailabilityWindow;
}

// EXIF data from photos
export interface ExifData {
  dateTime?: Date;
  latitude?: number;
  longitude?: number;
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Form types
export interface SpotFormData {
  name: string;
  latitude: number;
  longitude: number;
  description?: string;
}

export interface SessionFormData {
  spotId: string;
  date: Date;
  startTime: Date;
  endTime?: Date;
  rating: number;
  notes?: string;
  photoUrl?: string;
  surfboardId?: string | null;
  wetsuitId?: string | null;
}

// Extended types with relations
export interface SurfSpotWithSessions {
  id: string;
  userId: string;
  name: string;
  latitude: string;
  longitude: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  surfSessions: SurfSessionWithConditions[];
}

export interface SurfSessionWithConditions {
  id: string;
  spotId: string;
  userId: string;
  surfboardId: string | null;
  wetsuitId: string | null;
  date: Date;
  startTime: Date;
  endTime: Date | null;
  rating: number;
  notes: string | null;
  photoUrl: string | null;
  photos?: { id: string; photoUrl: string; sortOrder: number }[];
  createdAt: Date;
  updatedAt: Date;
  surfboard?: {
    id: string;
    name: string;
    brand: string | null;
    model: string | null;
    boardType: string | null;
    lengthInches: string | null;
    volume: string | null;
  } | null;
  wetsuit?: {
    id: string;
    name: string;
    brand: string | null;
    thickness: string | null;
    style: string | null;
  } | null;
  conditions?: {
    waveHeight: string | null;
    wavePeriod: string | null;
    waveDirection: string | null;
    primarySwellHeight: string | null;
    primarySwellPeriod: string | null;
    primarySwellDirection: string | null;
    secondarySwellHeight: string | null;
    secondarySwellPeriod: string | null;
    secondarySwellDirection: string | null;
    windWaveHeight: string | null;
    windWavePeriod: string | null;
    windWaveDirection: string | null;
    windSpeed: string | null;
    windDirection: string | null;
    windGust: string | null;
    airTemp: string | null;
    seaSurfaceTemp: string | null;
    humidity: string | null;
    precipitation: string | null;
    pressureMsl: string | null;
    cloudCover: string | null;
    visibility: string | null;
    tideHeight: string | null;
    timestamp: Date;
  } | null;
  spot?: {
    id: string;
    name: string;
    latitude: string;
    longitude: string;
  };
}
