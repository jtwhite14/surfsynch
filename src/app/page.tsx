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
      <nav className="sticky top-0 z-50 border-b border-black/[0.06] bg-white/90 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between h-14">
          <span className="flex items-center gap-2 text-base font-semibold tracking-tight text-gray-900">
            <BookOpen className="h-5 w-5 text-primary" />
            Wavebook
          </span>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
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
          <div className="relative z-10 max-w-5xl mx-auto px-6 pb-16 md:pb-24">
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
            className="absolute inset-0 z-0 bg-cover bg-top bg-no-repeat"
            style={{ backgroundImage: "url(/hero-bg.jpg)" }}
          />
          <div className="absolute inset-0 z-0 bg-gradient-to-b from-white/70 via-white/50 to-white" />

          {/* Bottom fade into page */}
          <div className="h-32 relative z-10 bg-gradient-to-b from-transparent to-background" />
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
