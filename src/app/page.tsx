import Link from "next/link";
import Image from "next/image";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { WaitlistForm } from "@/components/WaitlistForm";
import { BookOpen } from "lucide-react";

export default async function LandingPage() {
  const { userId } = await auth();
  if (userId) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-4 md:px-6 pt-3 md:pt-4">
        <div className="mx-auto max-w-6xl flex items-center justify-between h-12 md:h-14 px-5 md:px-8 rounded-full bg-white/30 backdrop-blur-md border border-white/40 shadow-sm">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight text-gray-900">
            <BookOpen className="h-4 w-4 text-primary" />
            Wavebook
          </span>
          <div className="flex items-center gap-8">
            <a href="#features" className="hidden md:block text-sm text-gray-700 hover:text-gray-900 transition-colors">Features</a>
            <a href="#how-it-works" className="hidden md:block text-sm text-gray-700 hover:text-gray-900 transition-colors">How It Works</a>
          <Link
            href="/login"
            className="text-sm font-medium text-gray-900 px-4 py-1.5 rounded-full border border-gray-900/20 hover:bg-white/40 transition-colors"
          >
            Log In
          </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-white">
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
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight text-foreground">
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
            <div className="rounded-xl overflow-hidden border border-white/[0.06]">
              <Image
                src="/screenshots/dashboard.png"
                alt="Dashboard showing surf alerts with forecast scores for multiple spots"
                width={2880}
                height={1640}
                className="w-full h-auto"
              />
            </div>
          </div>

          {/* Feature 2 — Sessions */}
          <div className="max-w-6xl mx-auto px-6 mb-32 md:mb-40">
            <div className="grid md:grid-cols-2 gap-8 md:gap-16 items-start mb-12 md:mb-16">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight text-foreground">
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
            <div className="rounded-xl overflow-hidden border border-white/[0.06]">
              <Image
                src="/screenshots/sessions.png"
                alt="Session log showing a list of surf sessions with photos and ratings"
                width={2880}
                height={1640}
                className="w-full h-auto"
              />
            </div>
          </div>

          {/* Feature 3 — Session Detail */}
          <div className="max-w-6xl mx-auto px-6 mb-32 md:mb-40">
            <div className="grid md:grid-cols-2 gap-8 md:gap-16 items-start mb-12 md:mb-16">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight text-foreground">
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
            <div className="rounded-xl overflow-hidden border border-white/[0.06]">
              <Image
                src="/screenshots/session-detail.png"
                alt="Detailed session view showing conditions, gear, and photos"
                width={2880}
                height={1640}
                className="w-full h-auto"
              />
            </div>
          </div>

          {/* Feature 4 — Privacy */}
          <div className="max-w-6xl mx-auto px-6">
            <div className="grid md:grid-cols-2 gap-8 md:gap-16 items-start mb-12 md:mb-16">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight text-foreground">
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
            <div className="rounded-xl overflow-hidden border border-white/[0.06]">
              <Image
                src="/screenshots/app-hero.png"
                alt="Map view showing private spot tracking with alerts"
                width={2880}
                height={1640}
                className="w-full h-auto"
              />
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
