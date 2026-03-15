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
  timestamp: Date;
}

export interface HourlyForecast extends MarineConditions {
  time: string;
}

export interface ForecastData {
  latitude: number;
  longitude: number;
  hourly: HourlyForecast[];
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

// Prediction types
export interface ConditionMatch {
  sessionId: string;
  sessionDate: Date;
  rating: number;
  spotName: string;
  matchScore: number; // 0-100
  matchingFactors: {
    waveHeight: boolean;
    swellDirection: boolean;
    swellPeriod: boolean;
    windSpeed: boolean;
  };
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
  date: Date;
  startTime: Date;
  endTime: Date | null;
  rating: number;
  notes: string | null;
  photoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
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
    timestamp: Date;
  } | null;
  spot?: {
    id: string;
    name: string;
    latitude: string;
    longitude: string;
  };
}
