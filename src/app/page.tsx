import Link from "next/link";
import Image from "next/image";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { WaitlistForm } from "@/components/WaitlistForm";
import { LandingNav } from "@/components/LandingNav";

export default async function LandingPage() {
  const { userId } = await auth();
  if (userId) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <LandingNav />

      <main className="flex-1">
        {/* Hero */}
        <section id="hero" className="relative overflow-hidden bg-white">
          {/* Copy */}
          <div className="relative z-10 pt-24 md:pt-32 pb-12 md:pb-16">
            <div className="max-w-2xl mx-auto px-6 text-center">
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight text-gray-900">
                Your waves. Your data.
                <br />
                Keep it that way.
              </h1>
              <p className="mt-6 text-lg text-gray-500 leading-relaxed max-w-xl mx-auto">
                An AI-powered surf tracker that doesn&apos;t ruin the sport we
                all love. Log sessions, track all of your favorite breaks, and
                get alerts when it&apos;s going off — without blowing up your
                spots.
              </p>
              <div className="mt-10">
                <WaitlistForm />
              </div>
            </div>
          </div>

          {/* App screenshot */}
          <div className="relative z-10 max-w-6xl mx-auto px-6">
            <div className="rounded-xl overflow-hidden shadow-2xl shadow-black/20 border border-black/[0.08]">
              <Image
                src="/screenshots/app-hero.png"
                alt="Wavebook dashboard showing surf alerts, forecast scores, and session history"
                width={2880}
                height={1640}
                className="w-full h-auto"
                priority
              />
            </div>
          </div>

          {/* Background image */}
          <div
            className="absolute inset-0 z-0 bg-top bg-no-repeat"
            style={{ backgroundImage: "url(/hero-bg.jpg)", backgroundSize: "120% auto" }}
          />

          {/* Bottom fade — screenshot bleeds into dark bg */}
          <div className="relative z-10 h-40 md:h-56 bg-gradient-to-b from-transparent via-background/70 to-background" />
        </section>

        {/* Features */}
        <section id="features" className="py-24 md:py-32">
          {/* Feature 1 — Alerts */}
          <div className="max-w-6xl mx-auto px-6 mb-32 md:mb-40">
            <div className="grid md:grid-cols-2 gap-8 md:gap-16 items-start mb-12 md:mb-16">
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight text-foreground">
                Never miss
                <br />
                another swell
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Get SMS alerts when conditions align at your spots. Wavebook
                scores every forecast window and texts you the ones worth
                waking up for — dawn patrol or afternoon glass.
              </p>
            </div>
            <div className="rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.03] aspect-[16/10] flex items-center justify-center">
              <span className="text-sm text-muted-foreground">2880 x 1800 — Alerts screenshot</span>
            </div>
          </div>

          {/* Feature 2 — Sessions */}
          <div className="max-w-6xl mx-auto px-6 mb-32 md:mb-40">
            <div className="grid md:grid-cols-2 gap-8 md:gap-16 items-start mb-12 md:mb-16">
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight text-foreground">
                Log every
                <br />
                session
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Track your sessions with photos, conditions, ratings, and
                notes. Build a personal archive of every wave you&apos;ve
                ridden — searchable, sortable, and entirely yours.
              </p>
            </div>
            <div className="rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.03] aspect-[16/10] flex items-center justify-center">
              <span className="text-sm text-muted-foreground">2880 x 1800 — Sessions screenshot</span>
            </div>
          </div>

          {/* Feature 3 — Session Detail */}
          <div className="max-w-6xl mx-auto px-6 mb-32 md:mb-40">
            <div className="grid md:grid-cols-2 gap-8 md:gap-16 items-start mb-12 md:mb-16">
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight text-foreground">
                Relive the
                <br />
                details
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Every session captures the full picture — swell, wind, tide,
                board, and wetsuit. See exactly what made a session great so
                you can chase the same conditions again.
              </p>
            </div>
            <div className="rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.03] aspect-[16/10] flex items-center justify-center">
              <span className="text-sm text-muted-foreground">2880 x 1800 — Session detail screenshot</span>
            </div>
          </div>

          {/* Feature 4 — Privacy */}
          <div className="max-w-6xl mx-auto px-6">
            <div className="grid md:grid-cols-2 gap-8 md:gap-16 items-start mb-12 md:mb-16">
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight text-foreground">
                Your spots
                <br />
                stay secret
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                No public feeds. No social features. No sharing your spots
                with the world. Wavebook is built for surfers who want to
                track their waves without blowing up their breaks.
              </p>
            </div>
            <div className="rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.03] aspect-[16/10] flex items-center justify-center">
              <span className="text-sm text-muted-foreground">2880 x 1800 — Privacy/map screenshot</span>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-8 text-center text-sm text-muted-foreground">
        <div className="flex items-center justify-center gap-6">
          <Link
            href="/privacy"
            className="hover:text-foreground transition-colors"
          >
            Privacy Policy
          </Link>
          <span className="text-border">|</span>
          <Link
            href="/terms"
            className="hover:text-foreground transition-colors"
          >
            Terms &amp; Conditions
          </Link>
        </div>
        <p className="mt-3">
          &copy; {new Date().getFullYear()} Wavebook. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
