"use client";

import { useEffect, useState, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { MapPin, Phone, Search } from "lucide-react";


const SpotMap = dynamic(() => import("@/components/map/SpotMap"), { ssr: false });

function formatPhoneDisplay(value: string): string {
  const digits = value.replace(/\D/g, "");
  // Remove leading "1" country code for formatting purposes
  const national = digits.startsWith("1") && digits.length > 10 ? digits.slice(1) : digits;
  if (national.length === 0) return "";
  if (national.length <= 3) return `(${national}`;
  if (national.length <= 6) return `(${national.slice(0, 3)}) ${national.slice(3)}`;
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6, 10)}`;
}

function toE164(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) return "";
  const national = digits.startsWith("1") && digits.length > 10 ? digits.slice(1) : digits;
  return `+1${national.slice(0, 10)}`;
}

export default function SettingsPage() {
  const { user } = useUser();
  const [homeLocation, setHomeLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationSaving, setLocationSaving] = useState(false);
  const [addressQuery, setAddressQuery] = useState("");
  const [addressResults, setAddressResults] = useState<Array<{ place_name: string; center: [number, number] }>>([]);
  const [addressSearching, setAddressSearching] = useState(false);
  const [phoneDisplay, setPhoneDisplay] = useState("");
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(true);
  const [phoneSaving, setPhoneSaving] = useState(false);

  // Track saved values to detect changes
  const [savedPhone, setSavedPhone] = useState("");
  const [savedSmsEnabled, setSavedSmsEnabled] = useState(false);
  const [savedLocation, setSavedLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const phoneE164 = toE164(phoneDisplay);

  const hasPhoneChanges = phoneE164 !== savedPhone || smsEnabled !== savedSmsEnabled;
  const hasLocationChanges =
    homeLocation?.latitude !== savedLocation?.latitude ||
    homeLocation?.longitude !== savedLocation?.longitude;

  useEffect(() => {
    fetchHomeLocation();
    fetchPhoneNumber();
  }, []);

  async function fetchHomeLocation() {
    try {
      const res = await fetch("/api/user/location");
      if (res.ok) {
        const data = await res.json();
        if (data.latitude && data.longitude) {
          const loc = { latitude: data.latitude, longitude: data.longitude };
          setHomeLocation(loc);
          setSavedLocation(loc);
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
        const phone = data.phoneNumber || "";
        setSavedPhone(phone);
        setSavedSmsEnabled(data.smsEnabled ?? false);
        setPhoneDisplay(phone ? formatPhoneDisplay(phone) : "");
        setSmsEnabled(data.smsEnabled ?? false);
      }
    } catch (error) {
      console.error("Error fetching phone number:", error);
    } finally {
      setPhoneLoading(false);
    }
  }

  function handlePhoneChange(value: string) {
    const digits = value.replace(/\D/g, "");
    // Limit to 11 digits (1 + 10-digit number)
    if (digits.length > 11) return;
    const formatted = formatPhoneDisplay(value);
    setPhoneDisplay(formatted);
    // Auto-enable SMS when a full phone number is entered and SMS isn't already on
    const e164 = toE164(value);
    if (e164.length === 12 && !smsEnabled) {
      setSmsEnabled(true);
    }
  }

  async function handleSavePhone() {
    setPhoneSaving(true);
    try {
      const res = await fetch("/api/user/phone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phoneE164 || "", smsEnabled }),
      });
      if (res.ok) {
        toast.success("Phone settings saved");
        setSavedPhone(phoneE164);
        setSavedSmsEnabled(smsEnabled);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save phone settings");
      }
    } catch {
      toast.error("Failed to save phone settings");
    } finally {
      setPhoneSaving(false);
    }
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
        toast.success("Location saved");
        setSavedLocation({ ...homeLocation });
      } else {
        toast.error("Failed to save location");
      }
    } catch {
      toast.error("Failed to save location");
    } finally {
      setLocationSaving(false);
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

  async function handleClearLocation() {
    setLocationSaving(true);
    try {
      const res = await fetch("/api/user/location", { method: "DELETE" });
      if (res.ok) {
        setHomeLocation(null);
        setSavedLocation(null);
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
              <p className="font-medium">{user?.fullName}</p>
              <p className="text-sm text-muted-foreground">{user?.primaryEmailAddress?.emailAddress}</p>
            </div>
            {user?.imageUrl && (
              <img
                src={user.imageUrl}
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
              <>
                <div className="relative max-w-xs">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">+1</span>
                  <Input
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={phoneDisplay}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex items-center justify-between pt-1">
                  <div>
                    <label htmlFor="sms-toggle" className="text-sm font-medium">
                      Text me when alerts fire
                    </label>
                    <p className="text-xs text-muted-foreground">
                      {smsEnabled && phoneE164.length === 12 ? "SMS alerts enabled" : "SMS alerts off"}
                    </p>
                  </div>
                  <Switch
                    id="sms-toggle"
                    checked={smsEnabled}
                    onCheckedChange={setSmsEnabled}
                    disabled={phoneE164.length !== 12}
                  />
                </div>
                <Button
                  size="sm"
                  onClick={handleSavePhone}
                  disabled={!hasPhoneChanges || phoneSaving}
                >
                  {phoneSaving ? "Saving..." : "Save"}
                </Button>
              </>
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
                  size="sm"
                  onClick={handleSaveLocation}
                  disabled={!hasLocationChanges || !homeLocation || locationSaving}
                >
                  {locationSaving ? "Saving..." : "Save"}
                </Button>
                {homeLocation && (
                  <Button variant="outline" size="sm" onClick={handleClearLocation} disabled={locationSaving}>
                    Clear
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>About Wavebook</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Wavebook helps you track your surf sessions and predicts the best times
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
