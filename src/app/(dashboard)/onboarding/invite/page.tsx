"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2, MapPin, Phone, Search } from "lucide-react";
import { toast } from "sonner";
import { formatPhoneDisplay, toE164 } from "@/lib/utils/phone";

const SpotMap = dynamic(() => import("@/components/map/SpotMap"), {
  ssr: false,
  loading: () => (
    <div className="h-48 rounded-lg bg-muted animate-pulse" />
  ),
});

export default function InviteOnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);
  const [shareId, setShareId] = useState(searchParams.get("shareId") || "");
  const [loading, setLoading] = useState(!searchParams.get("shareId"));

  // Phone state
  const [phoneDisplay, setPhoneDisplay] = useState("");
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [phoneSaving, setPhoneSaving] = useState(false);

  // Location state
  const [homeLocation, setHomeLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationSaving, setLocationSaving] = useState(false);
  const [addressQuery, setAddressQuery] = useState("");
  const [addressSearching, setAddressSearching] = useState(false);
  const [addressResults, setAddressResults] = useState<Array<{ center: [number, number]; place_name: string }>>([]);

  const phoneE164 = toE164(phoneDisplay);
  const phoneValid = phoneE164.length === 12;

  // If no shareId in URL, fetch most recent accepted share as fallback (e.g. page refresh)
  useEffect(() => {
    if (shareId) return;
    fetch("/api/shares/spots")
      .then((r) => (r.ok ? r.json() : { sharedSpots: [] }))
      .then((data) => {
        const spots = data.sharedSpots || [];
        if (spots.length > 0) {
          setShareId(spots[0].shareId);
        } else {
          router.push("/dashboard");
        }
      })
      .catch(() => router.push("/dashboard"))
      .finally(() => setLoading(false));
  }, [shareId, router]);

  function handlePhoneChange(value: string) {
    const digits = value.replace(/\D/g, "");
    if (digits.length > 11) return;
    const formatted = formatPhoneDisplay(value);
    setPhoneDisplay(formatted);
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
        body: JSON.stringify({ phoneNumber: phoneE164, smsEnabled }),
      });
      if (res.ok) {
        setStep(2);
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
        finishOnboarding();
      } else {
        toast.error("Failed to save location");
        setLocationSaving(false);
      }
    } catch {
      toast.error("Failed to save location");
      setLocationSaving(false);
    }
  }

  function finishOnboarding() {
    router.push(shareId ? `/dashboard?openShare=${shareId}` : "/dashboard");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          <div className={`h-1.5 w-12 rounded-full ${step >= 1 ? "bg-primary" : "bg-muted"}`} />
          <div className={`h-1.5 w-12 rounded-full ${step >= 2 ? "bg-primary" : "bg-muted"}`} />
        </div>

        {step === 1 && (
          <div className="rounded-xl border bg-card p-6 shadow-lg space-y-5">
            <div className="text-center space-y-2">
              <Phone className="size-10 mx-auto text-blue-500" />
              <h1 className="text-xl font-bold">Stay in the loop</h1>
              <p className="text-sm text-muted-foreground">
                Add your phone number to get SMS alerts when conditions are firing.
              </p>
            </div>

            <div className="space-y-3">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">+1</span>
                <Input
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={phoneDisplay}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
              </div>

              {phoneValid && (
                <div className="flex items-center justify-between">
                  <div>
                    <label htmlFor="sms-toggle" className="text-sm font-medium">
                      Text me when alerts fire
                    </label>
                    <p className="text-xs text-muted-foreground">
                      {smsEnabled ? "SMS alerts enabled" : "SMS alerts off"}
                    </p>
                  </div>
                  <Switch
                    id="sms-toggle"
                    checked={smsEnabled}
                    onCheckedChange={setSmsEnabled}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Button
                onClick={handleSavePhone}
                disabled={!phoneValid || phoneSaving}
                className="w-full"
              >
                {phoneSaving ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
              <button
                onClick={() => setStep(2)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip for now
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="rounded-xl border bg-card p-6 shadow-lg space-y-5">
            <div className="text-center space-y-2">
              <MapPin className="size-10 mx-auto text-blue-500" />
              <h1 className="text-xl font-bold">Where do you surf?</h1>
              <p className="text-sm text-muted-foreground">
                Set your home break so we can show nearby conditions.
              </p>
            </div>

            <div className="space-y-3">
              <form onSubmit={handleAddressSearch} className="relative">
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter your city or address..."
                    value={addressQuery}
                    onChange={(e) => setAddressQuery(e.target.value)}
                    className="flex-1"
                  />
                  <Button type="submit" variant="outline" size="icon" disabled={addressSearching || !addressQuery.trim()}>
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

              <div className="h-48 rounded-lg overflow-hidden border">
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

              {homeLocation && (
                <p className="text-xs text-muted-foreground text-center">
                  {homeLocation.latitude.toFixed(4)}, {homeLocation.longitude.toFixed(4)}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Button
                onClick={handleSaveLocation}
                disabled={!homeLocation || locationSaving}
                className="w-full"
              >
                {locationSaving ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  "Save & Continue"
                )}
              </Button>
              <button
                onClick={finishOnboarding}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip for now
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
