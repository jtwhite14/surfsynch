import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  decimal,
  integer,
  jsonb,
  boolean,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Users table
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  emailVerified: timestamp("email_verified"),
  image: text("image"),
  phoneNumber: varchar("phone_number", { length: 20 }),
  homeLatitude: decimal("home_latitude", { precision: 10, scale: 7 }),
  homeLongitude: decimal("home_longitude", { precision: 10, scale: 7 }),
  googleRefreshToken: text("google_refresh_token"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// NextAuth required tables - column names must match DrizzleAdapter expected names
export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 255 }).notNull(),
    provider: varchar("provider", { length: 255 }).notNull(),
    providerAccountId: varchar("providerAccountId", { length: 255 }).notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: varchar("token_type", { length: 255 }),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ]
);

export const sessions = pgTable("sessions", {
  sessionToken: varchar("sessionToken", { length: 255 }).primaryKey(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires").notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: varchar("identifier", { length: 255 }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    expires: timestamp("expires").notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
);

// Surf Spots table
export const surfSpots = pgTable("surf_spots", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  description: text("description"),
  conditionWeights: jsonb("condition_weights"), // ConditionWeights | null
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Surfboards table
export const surfboards = pgTable("surfboards", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  brand: varchar("brand", { length: 255 }),
  model: varchar("model", { length: 255 }),
  boardType: varchar("board_type", { length: 50 }),
  lengthInches: decimal("length_inches", { precision: 5, scale: 1 }),
  width: decimal("width", { precision: 4, scale: 2 }),
  thickness: decimal("thickness", { precision: 4, scale: 2 }),
  volume: decimal("volume", { precision: 5, scale: 1 }),
  finSetup: varchar("fin_setup", { length: 50 }),
  tailShape: varchar("tail_shape", { length: 50 }),
  notes: text("notes"),
  retired: boolean("retired").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_surfboards_user").on(table.userId),
]);

// Wetsuits table
export const wetsuits = pgTable("wetsuits", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  brand: varchar("brand", { length: 255 }),
  thickness: varchar("thickness", { length: 20 }),
  style: varchar("style", { length: 50 }),
  entry: varchar("entry", { length: 50 }),
  size: varchar("size", { length: 10 }),
  notes: text("notes"),
  retired: boolean("retired").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_wetsuits_user").on(table.userId),
]);

// Surf Sessions table
export const surfSessions = pgTable("surf_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  spotId: uuid("spot_id")
    .notNull()
    .references(() => surfSpots.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  surfboardId: uuid("surfboard_id")
    .references(() => surfboards.id, { onDelete: "set null" }),
  wetsuitId: uuid("wetsuit_id")
    .references(() => wetsuits.id, { onDelete: "set null" }),
  date: timestamp("date").notNull(),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  rating: integer("rating").notNull(), // 1-5
  notes: text("notes"),
  photoUrl: text("photo_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_surf_sessions_surfboard").on(table.surfboardId),
  index("idx_surf_sessions_wetsuit").on(table.wetsuitId),
]);

// Session Conditions table (captured at session time)
export const sessionConditions = pgTable("session_conditions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => surfSessions.id, { onDelete: "cascade" })
    .unique(),
  waveHeight: decimal("wave_height", { precision: 5, scale: 2 }),
  wavePeriod: decimal("wave_period", { precision: 5, scale: 2 }),
  waveDirection: decimal("wave_direction", { precision: 5, scale: 2 }),
  primarySwellHeight: decimal("primary_swell_height", { precision: 5, scale: 2 }),
  primarySwellPeriod: decimal("primary_swell_period", { precision: 5, scale: 2 }),
  primarySwellDirection: decimal("primary_swell_direction", { precision: 5, scale: 2 }),
  secondarySwellHeight: decimal("secondary_swell_height", { precision: 5, scale: 2 }),
  secondarySwellPeriod: decimal("secondary_swell_period", { precision: 5, scale: 2 }),
  secondarySwellDirection: decimal("secondary_swell_direction", { precision: 5, scale: 2 }),
  windWaveHeight: decimal("wind_wave_height", { precision: 5, scale: 2 }),
  windWavePeriod: decimal("wind_wave_period", { precision: 5, scale: 2 }),
  windWaveDirection: decimal("wind_wave_direction", { precision: 5, scale: 2 }),
  windSpeed: decimal("wind_speed", { precision: 5, scale: 2 }),
  windDirection: decimal("wind_direction", { precision: 5, scale: 2 }),
  windGust: decimal("wind_gust", { precision: 5, scale: 2 }),
  airTemp: decimal("air_temp", { precision: 5, scale: 2 }),
  seaSurfaceTemp: decimal("sea_surface_temp", { precision: 5, scale: 2 }),
  humidity: decimal("humidity", { precision: 5, scale: 2 }),
  precipitation: decimal("precipitation", { precision: 5, scale: 2 }),
  pressureMsl: decimal("pressure_msl", { precision: 7, scale: 2 }),
  cloudCover: decimal("cloud_cover", { precision: 5, scale: 2 }),
  visibility: decimal("visibility", { precision: 8, scale: 2 }),
  tideHeight: decimal("tide_height", { precision: 6, scale: 3 }),
  timestamp: timestamp("timestamp").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Spot Forecasts table (cached forecasts per spot)
export const spotForecasts = pgTable("spot_forecasts", {
  id: uuid("id").primaryKey().defaultRandom(),
  spotId: uuid("spot_id")
    .notNull()
    .references(() => surfSpots.id, { onDelete: "cascade" }),
  forecastData: jsonb("forecast_data").notNull(), // 16 days of hourly data
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_spot_forecasts_spot").on(table.spotId),
]);

// Spot Alerts table (computed alerts for forecast matching)
export const spotAlerts = pgTable("spot_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  spotId: uuid("spot_id")
    .notNull()
    .references(() => surfSpots.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  forecastHour: timestamp("forecast_hour").notNull(),
  timeWindow: varchar("time_window", { length: 20 }).notNull(), // 'dawn' | 'midday' | 'afternoon'
  matchScore: decimal("match_score", { precision: 5, scale: 2 }).notNull(),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }).notNull(),
  effectiveScore: decimal("effective_score", { precision: 5, scale: 2 }).notNull(),
  matchedSessionId: uuid("matched_session_id")
    .notNull()
    .references(() => surfSessions.id, { onDelete: "cascade" }),
  matchDetails: jsonb("match_details").notNull(), // per-variable similarity scores
  forecastSnapshot: jsonb("forecast_snapshot").notNull(), // matched hour + context
  status: varchar("status", { length: 20 }).notNull().default("active"), // active | dismissed | expired | confirmed
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_spot_alerts_active").on(table.spotId, table.userId, table.status),
  uniqueIndex("uq_spot_alerts_dedup").on(table.spotId, table.userId, table.forecastHour, table.timeWindow),
]);

// Session Photos table (multiple photos per session)
export const sessionPhotos = pgTable("session_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => surfSessions.id, { onDelete: "cascade" }),
  photoUrl: text("photo_url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  surfSpots: many(surfSpots),
  surfSessions: many(surfSessions),
  surfboards: many(surfboards),
  wetsuits: many(wetsuits),
  accounts: many(accounts),
  sessions: many(sessions),
  uploadSessions: many(uploadSessions),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const surfSpotsRelations = relations(surfSpots, ({ one, many }) => ({
  user: one(users, {
    fields: [surfSpots.userId],
    references: [users.id],
  }),
  surfSessions: many(surfSessions),
  forecasts: many(spotForecasts),
  alerts: many(spotAlerts),
}));

export const surfSessionsRelations = relations(surfSessions, ({ one, many }) => ({
  spot: one(surfSpots, {
    fields: [surfSessions.spotId],
    references: [surfSpots.id],
  }),
  user: one(users, {
    fields: [surfSessions.userId],
    references: [users.id],
  }),
  surfboard: one(surfboards, {
    fields: [surfSessions.surfboardId],
    references: [surfboards.id],
  }),
  wetsuit: one(wetsuits, {
    fields: [surfSessions.wetsuitId],
    references: [wetsuits.id],
  }),
  conditions: one(sessionConditions, {
    fields: [surfSessions.id],
    references: [sessionConditions.sessionId],
  }),
  photos: many(sessionPhotos),
}));

export const surfboardsRelations = relations(surfboards, ({ one, many }) => ({
  user: one(users, {
    fields: [surfboards.userId],
    references: [users.id],
  }),
  surfSessions: many(surfSessions),
}));

export const wetsuitsRelations = relations(wetsuits, ({ one, many }) => ({
  user: one(users, {
    fields: [wetsuits.userId],
    references: [users.id],
  }),
  surfSessions: many(surfSessions),
}));

export const sessionPhotosRelations = relations(sessionPhotos, ({ one }) => ({
  session: one(surfSessions, {
    fields: [sessionPhotos.sessionId],
    references: [surfSessions.id],
  }),
}));

export const sessionConditionsRelations = relations(sessionConditions, ({ one }) => ({
  session: one(surfSessions, {
    fields: [sessionConditions.sessionId],
    references: [surfSessions.id],
  }),
}));

export const spotForecastsRelations = relations(spotForecasts, ({ one }) => ({
  spot: one(surfSpots, {
    fields: [spotForecasts.spotId],
    references: [surfSpots.id],
  }),
}));

export const spotAlertsRelations = relations(spotAlerts, ({ one }) => ({
  spot: one(surfSpots, {
    fields: [spotAlerts.spotId],
    references: [surfSpots.id],
  }),
  user: one(users, {
    fields: [spotAlerts.userId],
    references: [users.id],
  }),
  matchedSession: one(surfSessions, {
    fields: [spotAlerts.matchedSessionId],
    references: [surfSessions.id],
  }),
}));

// Upload Sessions table (for QR code photo upload flow)
export const uploadSessions = pgTable("upload_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  status: varchar("status", { length: 50 }).notNull().default("pending"), // pending | uploading | completed | expired
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Upload Photos table (photos uploaded via mobile during onboarding)
export const uploadPhotos = pgTable("upload_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  uploadSessionId: uuid("upload_session_id")
    .notNull()
    .references(() => uploadSessions.id, { onDelete: "cascade" }),
  photoUrl: text("photo_url").notNull(),
  exifData: jsonb("exif_data"), // { dateTime, latitude, longitude }
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const uploadSessionsRelations = relations(uploadSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [uploadSessions.userId],
    references: [users.id],
  }),
  photos: many(uploadPhotos),
}));

export const uploadPhotosRelations = relations(uploadPhotos, ({ one }) => ({
  uploadSession: one(uploadSessions, {
    fields: [uploadPhotos.uploadSessionId],
    references: [uploadSessions.id],
  }),
}));

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type SurfSpot = typeof surfSpots.$inferSelect;
export type NewSurfSpot = typeof surfSpots.$inferInsert;
export type SurfSession = typeof surfSessions.$inferSelect;
export type NewSurfSession = typeof surfSessions.$inferInsert;
export type SessionCondition = typeof sessionConditions.$inferSelect;
export type NewSessionCondition = typeof sessionConditions.$inferInsert;
export type SpotForecast = typeof spotForecasts.$inferSelect;
export type NewSpotForecast = typeof spotForecasts.$inferInsert;
export type SessionPhoto = typeof sessionPhotos.$inferSelect;
export type NewSessionPhoto = typeof sessionPhotos.$inferInsert;
export type UploadSession = typeof uploadSessions.$inferSelect;
export type NewUploadSession = typeof uploadSessions.$inferInsert;
export type UploadPhoto = typeof uploadPhotos.$inferSelect;
export type NewUploadPhoto = typeof uploadPhotos.$inferInsert;
export type SpotAlert = typeof spotAlerts.$inferSelect;
export type NewSpotAlert = typeof spotAlerts.$inferInsert;
export type Surfboard = typeof surfboards.$inferSelect;
export type NewSurfboard = typeof surfboards.$inferInsert;
export type Wetsuit = typeof wetsuits.$inferSelect;
export type NewWetsuit = typeof wetsuits.$inferInsert;
