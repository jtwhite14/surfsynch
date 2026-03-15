"use client";

import { ConditionsTimeline } from "@/components/sessions/ConditionsTimeline";

interface SpotConditionsProps {
  spotId: string;
}

export function SpotConditions({ spotId }: SpotConditionsProps) {
  return <ConditionsTimeline spotId={spotId} />;
}
