"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Waves, Check, X } from "lucide-react";

interface InviteClientProps {
  code: string;
  isAuthenticated: boolean;
}

interface SpotInfo {
  spot: { name: string };
  sharedBy: { name: string | null };
}

type InviteState = "loading" | "valid" | "invalid" | "preview" | "claiming" | "accepted" | "declined" | "error";

export function InviteClient({ code, isAuthenticated }: InviteClientProps) {
  const router = useRouter();
  const [state, setState] = useState<InviteState>("loading");
  const [spotInfo, setSpotInfo] = useState<SpotInfo | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    checkInvite();
  }, []);

  async function checkInvite() {
    try {
      const res = await fetch(`/api/invite/${code}`);
      const data = await res.json();

      if (!data.valid) {
        setState("invalid");
        return;
      }

      if (isAuthenticated && data.spot) {
        setSpotInfo({ spot: data.spot, sharedBy: data.sharedBy });
        setState("preview");
      } else if (isAuthenticated) {
        // Authenticated but no details (shouldn't happen, but handle gracefully)
        setState("preview");
      } else {
        setState("valid");
      }
    } catch {
      setState("error");
      setError("Failed to load invite");
    }
  }

  async function handleClaim(action: "accept" | "decline") {
    setState("claiming");
    try {
      const res = await fetch(`/api/invite/${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setState("error");
        return;
      }

      if (action === "accept") {
        if (data.spot) setSpotInfo({ spot: data.spot, sharedBy: data.sharedBy });
        setState("accepted");
        setTimeout(() => router.push("/dashboard"), 2000);
      } else {
        setState("declined");
        setTimeout(() => router.push("/dashboard"), 2000);
      }
    } catch {
      setError("Failed to process invite");
      setState("error");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-secondary p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-lg space-y-6 text-center">
        <Waves className="size-10 mx-auto text-blue-500" />

        {state === "loading" && (
          <>
            <h1 className="text-lg font-semibold">Loading invite...</h1>
            <Loader2 className="size-6 mx-auto animate-spin text-muted-foreground" />
          </>
        )}

        {state === "invalid" && (
          <>
            <h1 className="text-lg font-semibold">Invite not found</h1>
            <p className="text-sm text-muted-foreground">
              This link may have expired or already been used.
            </p>
          </>
        )}

        {state === "valid" && !isAuthenticated && (
          <>
            <h1 className="text-lg font-semibold">You've been invited to view a surf spot</h1>
            <p className="text-sm text-muted-foreground">
              Sign up or log in to Wavebook to see this spot.
            </p>
            <div className="flex flex-col gap-2">
              <Button asChild>
                <a href={`/signup?redirect_url=/invite/${code}`}>Sign up</a>
              </Button>
              <Button variant="outline" asChild>
                <a href={`/login?redirect_url=/invite/${code}`}>Log in</a>
              </Button>
            </div>
          </>
        )}

        {state === "preview" && (
          <>
            <h1 className="text-lg font-semibold">
              {spotInfo?.sharedBy?.name
                ? `${spotInfo.sharedBy.name} shared a spot with you`
                : "You've been invited to view a surf spot"}
            </h1>
            {spotInfo?.spot?.name && (
              <p className="text-base font-medium text-foreground">{spotInfo.spot.name}</p>
            )}
            <p className="text-sm text-muted-foreground">
              Accept to add this spot to your shared spots.
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => handleClaim("accept")} className="gap-1.5">
                <Check className="size-4" />
                Accept
              </Button>
              <Button variant="outline" onClick={() => handleClaim("decline")} className="gap-1.5">
                <X className="size-4" />
                Decline
              </Button>
            </div>
          </>
        )}

        {state === "claiming" && (
          <>
            <h1 className="text-lg font-semibold">Processing...</h1>
            <Loader2 className="size-6 mx-auto animate-spin text-muted-foreground" />
          </>
        )}

        {state === "accepted" && (
          <>
            <h1 className="text-lg font-semibold text-green-500">Spot added!</h1>
            <p className="text-sm text-muted-foreground">
              {spotInfo?.sharedBy?.name ? `${spotInfo.sharedBy.name} shared` : "Shared"}{" "}
              <span className="font-medium text-foreground">{spotInfo?.spot?.name}</span> with you.
            </p>
            <p className="text-xs text-muted-foreground">Redirecting to dashboard...</p>
          </>
        )}

        {state === "declined" && (
          <>
            <h1 className="text-lg font-semibold">Invite declined</h1>
            <p className="text-xs text-muted-foreground">Redirecting to dashboard...</p>
          </>
        )}

        {state === "error" && (
          <>
            <h1 className="text-lg font-semibold text-red-500">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={() => router.push("/dashboard")}>
              Go to dashboard
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
