"use client";

import Link from "next/link";
import { BookOpen } from "lucide-react";
import { useEffect, useState } from "react";

export function LandingNav() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    function handleScroll() {
      const hero = document.getElementById("hero");
      if (!hero) return;
      const heroBottom = hero.getBoundingClientRect().bottom;
      // Switch to dark mode when navbar is below the hero section
      setIsDark(heroBottom < 60);
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 px-4 md:px-6 pt-3 md:pt-4">
      <div
        className={`mx-auto max-w-6xl flex items-center justify-between h-12 md:h-14 px-5 md:px-8 rounded-full backdrop-blur-md border shadow-sm transition-colors duration-300 ${
          isDark
            ? "bg-white/10 border-white/15"
            : "bg-white/30 border-white/40"
        }`}
      >
        <span
          className={`flex items-center gap-2 text-sm font-semibold tracking-tight transition-colors duration-300 ${
            isDark ? "text-white" : "text-gray-900"
          }`}
        >
          <BookOpen className="h-4 w-4 text-primary" />
          Wavebook
        </span>
        <div className="flex items-center gap-8">
          <a
            href="#features"
            className={`hidden md:block text-sm transition-colors duration-300 ${
              isDark
                ? "text-gray-300 hover:text-white"
                : "text-gray-700 hover:text-gray-900"
            }`}
          >
            Features
          </a>
          <a
            href="#how-it-works"
            className={`hidden md:block text-sm transition-colors duration-300 ${
              isDark
                ? "text-gray-300 hover:text-white"
                : "text-gray-700 hover:text-gray-900"
            }`}
          >
            How It Works
          </a>
          <Link
            href="/login"
            className={`text-sm font-medium px-4 py-1.5 rounded-full border transition-colors duration-300 ${
              isDark
                ? "text-white border-white/20 hover:bg-white/10"
                : "text-gray-900 border-gray-900/20 hover:bg-white/40"
            }`}
          >
            Log In
          </Link>
        </div>
      </div>
    </nav>
  );
}
