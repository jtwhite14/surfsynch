"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AvailabilityView } from "@/components/calendar/AvailabilityView";
import { toast } from "sonner";
import { AvailabilityWindow, CalendarEvent } from "@/types";
import { addDays } from "date-fns";
import { Input } from "@/components/ui/input";
import { MapPin, Phone, Search } from "lucide-react";
import { AlertTuning } from "@/components/alerts/AlertTuning";

const SpotMap = dynamic(() => import("@/components/map/SpotMap"), { ssr: false });

export default function SettingsPage() {
  const { data: session } = useSession();
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [availability, setAvailability] = useState<AvailabilityWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [homeLocation, setHomeLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationSaving, setLocationSaving] = useState(false);
  const [addressQuery, setAddressQuery] = useState("");
  const [addressResults, setAddressResults] = useState<Array<{ place_name: string; center: [number, number] }>>([]);
  const [addressSearching, setAddressSearching] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(true);
  const [phoneSaving, setPhoneSaving] = useState(false);

  useEffect(() => {
    fetchCalendarData();
    fetchHomeLocation();
    fetchPhoneNumber();
  }, []);

  async function fetchCalendarData() {
    try {
      const response = await fetch("/api/calendar");
      if (response.ok) {
        const data = await response.json();
        setCalendarConnected(data.connected);
        setEvents(data.events || []);
        setAvailability(
          (data.availability || []).map((a: AvailabilityWindow) => ({
            ...a,
            start: new Date(a.start),
            end: new Date(a.end),
          }))
        );
      }
    } catch (error) {
      console.error("Error fetching calendar:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleConnectCalendar() {
    // Re-authenticate with calendar scope
    signIn("google", {
      callbackUrl: "/settings",
    });
  }

  async function handleRefreshCalendar() {
    setRefreshing(true);
    try {
      const response = await fetch("/api/calendar?refresh=true");
      if (response.ok) {
        const data = await response.json();
        setEvents(data.events || []);
        setAvailability(
          (data.availability || []).map((a: AvailabilityWindow) => ({
            ...a,
            start: new Date(a.start),
            end: new Date(a.end),
          }))
        );
        toast.success("Calendar refreshed");
      } else {
        toast.error("Failed to refresh calendar");
      }
    } catch (error) {
      console.error("Error refreshing calendar:", error);
      toast.error("Failed to refresh calendar");
    } finally {
      setRefreshing(false);
    }
  }

  async function fetchHomeLocation() {
    try {
      const res = await fetch("/api/user/location");
      if (res.ok) {
        const data = await res.json();
        if (data.latitude && data.longitude) {
          setHomeLocation({ latitude: data.latitude, longitude: data.longitude });
        }
      }
    } catch (error) {
      console.error("Error fetching home location:", error);
    } finally {
      setLocationLoading(false);
    }
  }

  async function fetchPhoneNumber() {
    try {
      const res = await fetch("/api/user/phone");
      if (res.ok) {
        const data = await res.json();
        setPhoneNumber(data.phoneNumber || "");
      }
    } catch (error) {
      console.error("Error fetching phone number:", error);
    } finally {
      setPhoneLoading(false);
    }
  }

  async function handleSavePhone() {
    setPhoneSaving(true);
    try {
      const res = await fetch("/api/user/phone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      });
      if (res.ok) {
        toast.success("Phone number saved");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save phone number");
      }
    } catch {
      toast.error("Failed to save phone number");
    } finally {
      setPhoneSaving(false);
    }
  }

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setHomeLocation({ latitude: lat, longitude: lng });
    setAddressResults([]);
  }, []);

  async function handleAddressSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!addressQuery.trim()) return;
    setAddressSearching(true);
    setAddressResults([]);
    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addressQuery.trim())}.json?access_token=${token}&limit=5&types=address,place,locality,neighborhood,postcode`
      );
      if (res.ok) {
        const data = await res.json();
        setAddressResults(data.features || []);
      }
    } catch {
      toast.error("Address search failed");
    } finally {
      setAddressSearching(false);
    }
  }

  function handleSelectAddress(center: [number, number], placeName: string) {
    setHomeLocation({ latitude: center[1], longitude: center[0] });
    setAddressQuery(placeName);
    setAddressResults([]);
  }

  async function handleSaveLocation() {
    if (!homeLocation) return;
    setLocationSaving(true);
    try {
      const res = await fetch("/api/user/location", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(homeLocation),
      });
      if (res.ok) {
        toast.success("Home location saved");
      } else {
        toast.error("Failed to save location");
      }
    } catch {
      toast.error("Failed to save location");
    } finally {
      setLocationSaving(false);
    }
  }

  async function handleClearLocation() {
    setLocationSaving(true);
    try {
      const res = await fetch("/api/user/location", { method: "DELETE" });
      if (res.ok) {
        setHomeLocation(null);
        toast.success("Home location cleared");
      } else {
        toast.error("Failed to clear location");
      }
    } catch {
      toast.error("Failed to clear location");
    } finally {
      setLocationSaving(false);
    }
  }

  const startDate = new Date();
  const endDate = addDays(new Date(), 7);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold">Settings</h1>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{session?.user?.name}</p>
              <p className="text-sm text-muted-foreground">{session?.user?.email}</p>
            </div>
            {session?.user?.image && (
              <img
                src={session.user.image}
                alt="Profile"
                className="w-12 h-12 rounded-full"
              />
            )}
          </div>
          <Separator />
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Phone className="size-4" />
              Phone Number
            </label>
            <p className="text-sm text-muted-foreground">
              Add your phone number to receive SMS surf alerts
            </p>
            {phoneLoading ? (
              <div className="h-10 bg-muted rounded animate-pulse" />
            ) : (
              <div className="flex gap-2">
                <Input
                  type="tel"
                  placeholder="+1 (555) 123-4567"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="max-w-xs"
                />
                <Button onClick={handleSavePhone} disabled={phoneSaving}>
                  {phoneSaving ? "Saving..." : "Save"}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Home Location */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="size-5" />
            Home Location
          </CardTitle>
          <CardDescription>
            Set your home base to center the map within 50 miles of your location
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {locationLoading ? (
            <div className="h-64 bg-muted rounded-lg animate-pulse" />
          ) : (
            <>
              <form onSubmit={handleAddressSearch} className="relative">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      placeholder="Enter your address or city..."
                      value={addressQuery}
                      onChange={(e) => setAddressQuery(e.target.value)}
                    />
                  </div>
                  <Button type="submit" variant="outline" disabled={addressSearching || !addressQuery.trim()}>
                    <Search className="size-4" />
                  </Button>
                </div>
                {addressResults.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-lg">
                    {addressResults.map((result, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSelectAddress(result.center, result.place_name)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors first:rounded-t-md last:rounded-b-md"
                      >
                        <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{result.place_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </form>
              <div className="h-64 rounded-lg overflow-hidden border">
                <SpotMap
                  spots={[]}
                  onMapClick={handleMapClick}
                  interactive
                  newSpotMarker={homeLocation ? { lat: homeLocation.latitude, lng: homeLocation.longitude } : null}
                  initialViewState={
                    homeLocation
                      ? { longitude: homeLocation.longitude, latitude: homeLocation.latitude, zoom: 9 }
                      : undefined
                  }
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {homeLocation
                  ? `Location: ${homeLocation.latitude.toFixed(4)}, ${homeLocation.longitude.toFixed(4)}`
                  : "Click the map to set your home location"}
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={handleSaveLocation}
                  disabled={!homeLocation || locationSaving}
                >
                  {locationSaving ? "Saving..." : "Save Location"}
                </Button>
                {homeLocation && (
                  <Button variant="outline" onClick={handleClearLocation} disabled={locationSaving}>
                    Clear
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Alert Tuning */}
      <AlertTuning />

      {/* Calendar Integration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Google Calendar</CardTitle>
              <CardDescription>
                Connect your calendar to see when you're free to surf
              </CardDescription>
            </div>
            {calendarConnected && (
              <Badge variant="outline" className="bg-green-500/15 text-green-400 border-green-500/30">
                Connected
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-muted rounded w-3/4"></div>
              <div className="h-4 bg-muted rounded w-1/2"></div>
            </div>
          ) : calendarConnected ? (
            <>
              <p className="text-sm text-muted-foreground">
                Your Google Calendar is connected. SurfSync can see your busy/free
                times to suggest optimal surf windows.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleRefreshCalendar}
                  disabled={refreshing}
                >
                  {refreshing ? "Refreshing..." : "Refresh Calendar"}
                </Button>
              </div>

              <Separator />

              {/* Weekly availability preview */}
              <div>
                <h3 className="font-medium mb-4">This Week's Availability</h3>
                <AvailabilityView
                  events={events.map((e) => ({
                    ...e,
                    start: new Date(e.start),
                    end: new Date(e.end),
                  }))}
                  availability={availability}
                  startDate={startDate}
                  endDate={endDate}
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Connect your Google Calendar to enable "Golden Window"
                predictions - when good surf conditions align with your free time.
              </p>
              <div className="bg-muted/50 p-4 rounded-lg space-y-2 text-sm">
                <p className="font-medium">What we access:</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li>Read-only access to your calendar events</li>
                  <li>We only check event times, not details</li>
                  <li>Your data is never shared</li>
                </ul>
              </div>
              <Button onClick={handleConnectCalendar}>
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Connect Google Calendar
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>About SurfSync</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            SurfSync helps you track your surf sessions and predicts the best times
            to surf based on your past experiences.
          </p>
          <p>
            Weather data provided by{" "}
            <a
              href="https://open-meteo.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Open-Meteo
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
