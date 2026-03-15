"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  Waves,
  BookOpen,
  Settings,
  LogOut,
  Menu,
  X,
  PanelLeft,
} from "lucide-react";

const navigation = [
  { name: "Home", href: "/", icon: LayoutDashboard },
  { name: "Sessions", href: "/sessions", icon: Waves },
];

function useSidebarState() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("sidebar-collapsed");
    return stored === null ? true : stored === "true";
  });

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  }, []);

  return [collapsed, toggle] as const;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, toggleCollapsed] = useSidebarState();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated" || onboardingChecked) return;

    async function checkOnboarding() {
      try {
        const res = await fetch("/api/onboarding/check");
        if (res.ok) {
          const data = await res.json();
          if (data.needsOnboarding && pathname !== "/onboarding") {
            router.push("/onboarding");
          }
        }
      } catch {
        // If the check fails, proceed normally
      } finally {
        setOnboardingChecked(true);
      }
    }

    checkOnboarding();
  }, [status, onboardingChecked, pathname, router]);

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  if (status === "loading" || (status === "authenticated" && !onboardingChecked)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Sidebar — desktop */}
        <nav
          className={`hidden lg:flex shrink-0 flex-col border-r bg-sidebar h-full transition-[width] duration-200 ease-in-out ${
            collapsed ? "w-[60px]" : "w-[240px]"
          }`}
        >
          <SidebarContent
            session={session}
            pathname={pathname}
            isActive={isActive}
            collapsed={collapsed}
            onToggle={toggleCollapsed}
          />
        </nav>

        {/* Mobile overlay */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar — mobile slide-out (always expanded) */}
        <nav
          className={`fixed inset-y-0 left-0 z-50 w-[280px] flex flex-col bg-sidebar border-r transform transition-transform duration-200 ease-in-out lg:hidden ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-end p-3">
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              <X className="size-5" />
            </button>
          </div>
          <SidebarContent
            session={session}
            pathname={pathname}
            isActive={isActive}
            collapsed={false}
            onToggle={toggleCollapsed}
          />
        </nav>

        {/* Main content area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Mobile top bar */}
          <header className="flex items-center h-14 px-4 border-b bg-background lg:hidden">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-1.5 -ml-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              <Menu className="size-5" />
            </button>
            <Link href="/" className="flex items-center gap-2 ml-3">
              <BookOpen className="size-5 text-primary" />
              <span className="font-bold text-sm">SurfSync</span>
            </Link>
          </header>

          <main className={`flex-1 ${pathname === "/" ? "overflow-hidden" : "overflow-y-auto"}`}>
            {pathname === "/" ? children : <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

function SidebarContent({
  session,
  pathname,
  isActive,
  collapsed,
  onToggle,
}: {
  session: { user?: { name?: string | null; email?: string | null; image?: string | null } };
  pathname: string;
  isActive: (href: string) => boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      {/* Brand */}
      <div className={`flex flex-col gap-3 p-3 border-b border-sidebar-border ${collapsed ? "items-center" : ""}`}>
        <Link href="/" className={`flex items-center gap-2.5 ${collapsed ? "justify-center" : "px-1.5"} py-1`}>
          <BookOpen className="size-5 text-primary shrink-0" />
          {!collapsed && <span className="font-bold text-sidebar-foreground">SurfSync</span>}
        </Link>
      </div>

      {/* Navigation */}
      <div className={`flex flex-col gap-px p-3 flex-1 ${collapsed ? "items-center" : ""}`}>
        {navigation.map((item) => {
          const active = isActive(item.href);
          const link = (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center rounded-md text-sm font-medium transition-colors ${
                collapsed
                  ? `justify-center size-9 ${
                      active
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`
                  : `gap-2.5 px-2.5 py-1.5 w-full ${
                      active
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`
              }`}
            >
              <item.icon className="size-4 shrink-0" />
              {!collapsed && item.name}
            </Link>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.name}</TooltipContent>
              </Tooltip>
            );
          }
          return link;
        })}
      </div>

      {/* Toggle + Profile — bottom */}
      <div className={`border-t border-sidebar-border p-3 flex flex-col gap-1 ${collapsed ? "items-center" : ""}`}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onToggle}
                className="flex items-center justify-center size-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <PanelLeft className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Expand sidebar</TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={onToggle}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <PanelLeft className="size-4 shrink-0" />
            Collapse
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {collapsed ? (
              <button className="flex items-center justify-center size-9 rounded-md hover:bg-accent transition-colors">
                <Avatar className="size-7">
                  <AvatarImage
                    src={session.user?.image || undefined}
                    alt={session.user?.name || "User"}
                  />
                  <AvatarFallback className="text-xs">
                    {session.user?.name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
              </button>
            ) : (
              <button className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent transition-colors">
                <Avatar className="size-7">
                  <AvatarImage
                    src={session.user?.image || undefined}
                    alt={session.user?.name || "User"}
                  />
                  <AvatarFallback className="text-xs">
                    {session.user?.name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-sidebar-foreground text-sm leading-tight">
                    {session.user?.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground leading-tight">
                    {session.user?.email}
                  </p>
                </div>
              </button>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align={collapsed ? "center" : "start"} className="w-56">
            <DropdownMenuItem asChild>
              <Link href="/settings" className="flex items-center gap-2">
                <Settings className="size-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
