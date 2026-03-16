import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { WaitlistForm } from "@/components/WaitlistForm";
import {
  HeroScreenshot,
  FeatureScreenshots,
} from "@/components/ScreenshotShowcase";
import {
  MapPin,
  BookOpen,
  Waves,
  MessageSquare,
  Calendar,
  Users,
  Brain,
  Sparkles,
} from "lucide-react";

const features = [
  {
    icon: MapPin,
    title: "Spot Tracking",
    description: "Pin your spots on a private map. Your lineup, your data.",
  },
  {
    icon: BookOpen,
    title: "Session Logging",
    description: "Log every session — conditions, board, rating, notes.",
  },
  {
    icon: Waves,
    title: "Live Conditions",
    description: "Real-time swell, wind, and tide for every saved spot.",
  },
  {
    icon: Brain,
    title: "AI Forecast Scoring",
    description:
      "Wavebook learns from your sessions to score upcoming forecasts — so you know which days match your kind of surf.",
  },
  {
    icon: MessageSquare,
    title: "Smart SMS Alerts",
    description:
      "Get a text when AI detects conditions aligning with your best sessions. No manual thresholds needed.",
  },
  {
    icon: Calendar,
    title: "Weekly Forecast",
    description:
      "7-day forecast scored by AI against your session history, so you can plan your week around the days that matter.",
  },
  {
    icon: Sparkles,
    title: "Condition Profiles",
    description:
      "Define your ideal conditions and Wavebook matches them against real-time forecasts to surface the sessions worth waking up for.",
  },
  {
    icon: Users,
    title: "Spot Sharing",
    description:
      "Share individual spots with up to 5 trusted friends. That's it.",
  },
];

export default async function LandingPage() {
  const session = await getServerSession(authOptions);
  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-background/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between h-14">
          <span className="text-base font-semibold tracking-tight">
            Wavebook
          </span>
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Log In
          </Link>
        </div>
      </nav>

      <main className="flex-1">
        {/* Hero */}
        <section className="py-28 md:py-36">
          <div className="max-w-2xl mx-auto px-6 text-center">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight">
              Your waves. Your data.
              <br />
              Nobody else&apos;s.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto">
              Wavebook is a private, AI-powered surf tracker. Log sessions,
              track conditions, and let machine learning score every forecast
              against your personal wave history — all without exposing your
              spots.
            </p>
            <div className="mt-10">
              <WaitlistForm />
            </div>
          </div>
        </section>

        {/* Hero Screenshot */}
        <HeroScreenshot />

        {/* Philosophy */}
        <section className="py-24 md:py-32">
          <div className="max-w-2xl mx-auto px-6">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
              Why private?
            </h2>
            <div className="mt-6 space-y-4 text-muted-foreground leading-relaxed">
              <p>
                We built Wavebook because the best sessions don&apos;t need an
                audience. Every surfer knows the tension — you want to track your
                waves, dial in conditions, get better. But you don&apos;t want
                to broadcast your spots to the world.
              </p>
              <p>
                Wavebook learns what makes a great session{" "}
                <span className="text-foreground">for you</span>. It
                cross-references swell, wind, tide, and weather against your
                logged sessions to score every forecast window — then alerts you
                when conditions align. All of it stays private. No social feeds,
                no public profiles, no check-in maps for the masses.
              </p>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-24 md:py-32">
          <div className="max-w-5xl mx-auto px-6">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-center">
              Everything you need. Nothing you don&apos;t.
            </h2>
            <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-6">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm p-6"
                >
                  <feature.icon className="h-5 w-5 text-primary mb-3" />
                  <h3 className="font-semibold text-sm">{feature.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* App Screenshots */}
        <FeatureScreenshots />

        {/* Privacy Commitment */}
        <section className="py-24 md:py-32">
          <div className="max-w-2xl mx-auto px-6">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
              No leaderboards. No check-ins.
              <br />
              No crowds.
            </h2>
            <ul className="mt-8 space-y-4 text-muted-foreground leading-relaxed">
              <li className="flex gap-3">
                <span className="text-primary mt-1 shrink-0">—</span>
                Your spots never appear on public maps or feeds. Period.
              </li>
              <li className="flex gap-3">
                <span className="text-primary mt-1 shrink-0">—</span>
                No social features, no follower counts, no exposure metrics.
                Wavebook is a tool, not a platform.
              </li>
              <li className="flex gap-3">
                <span className="text-primary mt-1 shrink-0">—</span>
                Share a spot with up to 5 people you trust — or keep it all to
                yourself. Your call.
              </li>
            </ul>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="py-24 md:py-32">
          <div className="max-w-2xl mx-auto px-6 text-center">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
              Paddle out with us.
            </h2>
            <div className="mt-8">
              <WaitlistForm />
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
