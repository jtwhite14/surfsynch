"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { ReactNode } from "react";

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ClerkProvider appearance={{ baseTheme: dark }}>
      {children}
    </ClerkProvider>
  );
}
