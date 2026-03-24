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
  waveEnergy: number | null;
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

// Cardinal direction type for swell exposure
export type CardinalDirection = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export const VALID_CARDINAL_DIRECTIONS: CardinalDirection[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// Wind speed tolerance per direction (used by WindRose)
export type WindSpeedTier = 'light' | 'moderate' | 'strong';

export const WIND_SPEED_TIER_THRESHOLDS: Record<WindSpeedTier, number> = {
  light: 10,     // up to 10 km/h
  moderate: 20,  // up to 20 km/h
  strong: 30,    // up to 30 km/h
};

// Preference types for follow-up questions
export type PreferredWaveSize = 'small' | 'medium' | 'large' | 'xl';
export type PreferredSwellPeriod = 'short' | 'medium' | 'long';
export type PreferredWind = 'glassy' | 'offshore' | 'cross-offshore' | 'onshore';
export type PreferredTide = 'low' | 'mid' | 'high' | 'incoming' | 'outgoing';

export const VALID_PREFERRED_WAVE_SIZES: PreferredWaveSize[] = ['small', 'medium', 'large', 'xl'];
export const VALID_PREFERRED_SWELL_PERIODS: PreferredSwellPeriod[] = ['short', 'medium', 'long'];
export const VALID_PREFERRED_WINDS: PreferredWind[] = ['glassy', 'offshore', 'cross-offshore', 'onshore'];
export const VALID_PREFERRED_TIDES: PreferredTide[] = ['low', 'mid', 'high', 'incoming', 'outgoing'];

// Condition weight configuration per spot
export interface ConditionWeights {
  swellHeight: number;    // 0-1
  swellPeriod: number;    // 0-1
  swellDirection: number; // 0-1
  tideHeight: number;     // 0-1
  windSpeed: number;      // 0-1
  windDirection: number;  // 0-1
  waveEnergy: number;     // 0-1
  preferredTide?: PreferredTide[];
  preferredWaveSize?: PreferredWaveSize[];
  preferredSwellPeriod?: PreferredSwellPeriod[];
  preferredWind?: PreferredWind[];
  swellExposure?: CardinalDirection[];
  preferredWindDirections?: CardinalDirection[];
  notes?: string;
}

export const DEFAULT_CONDITION_WEIGHTS: ConditionWeights = {
  swellHeight: 0.8,
  swellPeriod: 0.7,
  swellDirection: 0.9,
  tideHeight: 0.5,
  windSpeed: 0.7,
  windDirection: 0.6,
  waveEnergy: 0.8,
  preferredTide: undefined,
};

// Weight presets for common spot types
export const WEIGHT_PRESETS: Record<string, { label: string; weights: Partial<ConditionWeights> }> = {
  allAround: {
    label: "All-around",
    weights: { swellHeight: 0.8, swellPeriod: 0.7, swellDirection: 0.9, tideHeight: 0.5, windSpeed: 0.7, windDirection: 0.6, waveEnergy: 0.8 },
  },
  reefBreak: {
    label: "Reef break",
    weights: { swellHeight: 0.7, swellPeriod: 0.9, swellDirection: 1.0, tideHeight: 0.9, windSpeed: 0.8, windDirection: 0.7, waveEnergy: 0.8, preferredTide: ['low'], preferredWind: ['offshore'], preferredSwellPeriod: ['long'] },
  },
  beachBreak: {
    label: "Beach break",
    weights: { swellHeight: 0.9, swellPeriod: 0.6, swellDirection: 0.7, tideHeight: 0.4, windSpeed: 0.9, windDirection: 0.7, waveEnergy: 0.9, preferredWind: ['glassy'] },
  },
  pointBreak: {
    label: "Point break",
    weights: { swellHeight: 0.7, swellPeriod: 0.8, swellDirection: 1.0, tideHeight: 0.6, windSpeed: 0.7, windDirection: 0.8, waveEnergy: 0.8, preferredTide: ['mid'], preferredWind: ['offshore'], preferredSwellPeriod: ['long'] },
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
  waveEnergy: number | null;
  coverage: number;              // fraction of variables that were non-null
  ratingBoost: number;           // multiplier from session rating
  forecastConfidence: number;    // decay factor from days out
}

// Condition profile types
export interface ConditionProfileResponse {
  id: string;
  spotId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  targetSwellHeight: number | null;
  targetSwellPeriod: number | null;
  targetSwellDirection: number | null;
  targetWindSpeed: number | null;
  targetWindDirection: number | null;
  targetTideHeight: number | null;
  activeMonths: number[] | null;
  consistency: 'low' | 'medium' | 'high';
  qualityCeiling: number; // 1-5
  reinforcementCount: number;
  source: 'manual' | 'auto_generated';
  weightSwellHeight: number;
  weightSwellPeriod: number;
  weightSwellDirection: number;
  weightTideHeight: number;
  weightWindSpeed: number;
  weightWindDirection: number;
  weightWaveEnergy: number;
  selections: ProfileSelections | null;
  exclusions: ExclusionZones | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProfileSelections {
  waveSize?: string[];
  waveSizeRange?: { min: number; max: number | null }; // feet, max=null means "no upper limit"
  swellPeriod?: string[];
  swellPeriodRange?: { min: number; max: number | null }; // seconds, max=null means "no upper limit"
  swellDirection?: string[];
  windCondition?: string[];
  windDirection?: string[];
  windRose?: Partial<Record<CardinalDirection, WindSpeedTier>>; // per-direction speed tolerance
  tideLevel?: string[];
  tideCurve?: { segments: boolean[] }; // 12 segments of the tide cycle
}

// Exclusion zones: conditions that are absolute dealbreakers
export interface ExclusionZones {
  // Directional: cardinal directions that kill the spot (each covers ±22.5°)
  windDirection?: CardinalDirection[];
  swellDirection?: CardinalDirection[];
  // Categorical: category keys that are dealbreakers (resolved to numeric ranges at match time)
  swellHeight?: string[];    // e.g. ['small', 'xl']
  swellHeightRange?: { min: number; max: number | null }; // feet, veto if height falls in this range
  swellPeriod?: string[];    // e.g. ['short']
  swellPeriodRange?: { min: number; max: number | null }; // seconds, veto if period falls in this range
  windSpeed?: string[];      // e.g. ['onshore']
  tideHeight?: string[];     // e.g. ['high']
  tideCurve?: { segments: boolean[] }; // 12 segments of the tide cycle that are dealbreakers
}

export interface ProfileForMatching {
  id: string;
  name: string;
  conditions: {
    swellHeight: number | null;
    swellPeriod: number | null;
    swellDirection: number | null;
    windSpeed: number | null;
    windDirection: number | null;
    tideHeight: number | null;
    waveEnergy: number | null;
  };
  specifiedVars: Set<string>;
  reinforcementCount: number;
  consistency: 'low' | 'medium' | 'high';
  qualityCeiling: number; // 1-5
  weights: ConditionWeights;
  selections?: ProfileSelections | null;
  exclusions?: ExclusionZones | null;
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
  matchedSession?: {
    id: string;
    date: Date;
    rating: number;
    notes: string | null;
    photoUrl: string | null;
  };
  matchedProfile?: {
    id: string;
    name: string;
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

// Spot sharing types
export interface SpotShareResponse {
  id: string;
  spotId: string;
  sharedByUserId: string;
  sharedWithUserId: string | null;
  status: 'pending' | 'accepted' | 'declined';
  inviteCode: string;
  inviteUrl?: string;
  createdAt: Date;
  respondedAt: Date | null;
  sharedWith?: {
    id: string;
    name: string | null;
    email: string;
  };
  sharedBy?: {
    id: string;
    name: string | null;
    email: string;
  };
}

export interface SharedSpotView {
  shareId: string;
  spot: {
    id: string;
    name: string;
    latitude: string;
    longitude: string;
    description: string | null;
  };
  sharedBy: {
    id: string;
    name: string | null;
  };
  highRatedSessionCount: number;
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
  ignored: boolean;
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
    waveEnergy: string | null;
    timestamp: Date;
  } | null;
  spot?: {
    id: string;
    name: string;
    latitude: string;
    longitude: string;
  };
}
