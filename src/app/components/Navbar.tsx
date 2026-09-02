"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { Menu, X, ChevronRight, ChevronDown, LogOut, LayoutDashboard, User, Shield, ShoppingBag, ScrollText, Heart, Briefcase, Coffee, Globe } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import Tooltip from "@/app/components/Tooltip";
import { TOOLTIP_COPY } from "@/lib/tooltipCopy";

/**
 * `label` is the canonical name — it keys into TOOLTIP_COPY and is shown in
 * the mobile drawer where there's room. `short` is the compact desktop-bar
 * display so all links fit on a single line.
 */
interface NavLink {
  label: string;
  href: string;
  short?: string;
}

interface NavGroup {
  label: string;
  items: Array<{ label: string; href: string; description?: string }>;
}

/**
 * Top-nav is grouped so the breadth of Vending Connector reads at a
 * glance without cramming every route into a flat bar. Desktop renders
 * each group as a hover/focus dropdown; mobile drawer flattens the
 * same items into labelled sections. Every historical route from the
 * pre-redesign flat nav is preserved somewhere in this structure so
 * bookmarks + inbound links keep working.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Marketplace",
    items: [
      { label: "Available Locations", href: "/browse-requests", description: "Open location requests waiting for operators" },
      { label: "Sell a Location", href: "/marketplace", description: "List a location or route for sale" },
      { label: "Machines for Sale", href: "/machines-for-sale", description: "Vending equipment and AI-powered solutions" },
    ],
  },
  {
    label: "Services",
    items: [
      { label: "Financing", href: "/financing", description: "Up to 10-year equipment financing options" },
      { label: "Coffee Program", href: "/coffee", description: "Commercial coffee with qualifying free brewer" },
      { label: "Website Services", href: "/website-services", description: "Professional site for your vending business" },
      { label: "Location Services", href: "/request-location", description: "Get help placing your machines" },
    ],
  },
  {
    label: "Community",
    items: [
      { label: "Placement Providers", href: "/placement", description: "List placements, keep 100% of your commission" },
      { label: "Operators", href: "/browse-operators", description: "Directory of vending operators" },
    ],
  },
];

// Mobile-drawer extras — items that don't belong to a top-nav group
// but should still be reachable from the drawer.
const drawerExtraLinks: NavLink[] = [
  { label: "How It Works", href: "/how-it-works" },
];

interface SessionUser {
  email: string;
  name: string;
}

const SKIP_PROFILE_CHECK_PATHS = [
  "/complete-profile",
  "/login",
  "/signup",
  "/auth/callback",
  "/auth",
  "/how-it-works",
  "/pricing",
  "/careers",
];

function profileIncomplete(p: Profile): boolean {
  return !p.phone || !p.address || !p.city || !p.state || !p.zip;
}

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  // Which top-nav group dropdown is currently pinned open by a click.
  // Null when nothing is click-pinned; hover state is still handled by
  // the CSS classes below, so pointer users see no behavior change.
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navGroupsRef = useRef<HTMLUListElement | null>(null);
  const [storefrontNav, setStorefrontNav] = useState<{
    owner_tenant: { slug: string; display_name: string; status: string } | null;
    can_own_storefront?: boolean;
    enrolled_tenant: { slug: string; display_name: string } | null;
  } | null>(null);

  // Effective nav groups: base NAV_GROUPS + storefront items injected
  // into the "Services" group under "Coffee Program". Signed-out
  // visitors and users with no storefront relationship see the
  // base groups only.
  const effectiveNavGroups: NavGroup[] = NAV_GROUPS.map((group) => {
    if (group.label !== "Services") return group;
    const extras: Array<{ label: string; href: string; description?: string }> = [];
    if (storefrontNav?.owner_tenant) {
      const t = storefrontNav.owner_tenant;
      extras.push({
        label: `My Storefront${t.status !== "approved" ? ` (${t.status})` : ""}`,
        href: "/coffee/storefront",
        description: `Manage ${t.display_name} — pricing, customers, invitations, brand`,
      });
    } else if (
      // Fallback for signed-in users who could own a storefront but
      // haven't created one yet (or where nav-context didn't load).
      // Same permissive semantic as the dashboard fallback tile —
      // /coffee/storefront handles who can actually create.
      sessionUser
    ) {
      extras.push({
        label: "Set up my storefront",
        href: "/coffee/storefront",
        description: "Launch a branded coffee page for your customers",
      });
    }
    if (storefrontNav?.enrolled_tenant) {
      const t = storefrontNav.enrolled_tenant;
      extras.push({
        label: `Order from ${t.display_name}`,
        href: `/coffee/o/${t.slug}`,
        description: "Your enrolled storefront — real prices, one-click checkout",
      });
    }
    if (extras.length === 0) return group;
    return { ...group, items: [...group.items, ...extras] };
  });

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Check auth state
  useEffect(() => {
    const supabase = createBrowserClient();

    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        // Set basic session info immediately so navbar shows logged-in state
        const meta = session.user?.user_metadata || {};
        setSessionUser({
          email: session.user?.email || "",
          name: meta.full_name || meta.name || meta.custom_claims?.global_name || session.user?.email?.split("@")[0] || "User",
        });

        try {
          const [profileRes, adminRes] = await Promise.all([
            fetch("/api/auth/me", {
              headers: { Authorization: `Bearer ${session.access_token}` },
            }),
            fetch("/api/admin/check", {
              headers: { Authorization: `Bearer ${session.access_token}` },
            }),
          ]);
          let userIsAdmin = false;
          if (adminRes.ok) {
            const data = await adminRes.json();
            userIsAdmin = !!data.isAdmin;
            setIsAdmin(userIsAdmin);
          }
          if (profileRes.ok) {
            const data = await profileRes.json();
            setProfile(data);
            if (
              !userIsAdmin &&
              profileIncomplete(data) &&
              !SKIP_PROFILE_CHECK_PATHS.some((p) => window.location.pathname.startsWith(p))
            ) {
              window.location.href = "/complete-profile";
              return;
            }
          }
          // Fetch storefront nav-context so the Services dropdown
          // can add "My Storefront" (owner) and/or "Order from
          // {tenant}" (enrolled customer) alongside the existing
          // "Coffee Program" link. Best-effort — a failure just
          // means the dynamic items don't appear.
          try {
            const nRes = await fetch("/api/coffee/nav-context", {
              headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (nRes.ok) setStorefrontNav(await nRes.json());
          } catch {}
        } catch {
          // ignore — sessionUser still shows logged-in state
        }
      }
    }

    checkAuth();

    // Listen for auth state changes (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN" && session?.access_token) {
          const meta = session.user?.user_metadata || {};
          setSessionUser({
            email: session.user?.email || "",
            name: meta.full_name || meta.name || meta.custom_claims?.global_name || session.user?.email?.split("@")[0] || "User",
          });

          try {
            const [profileRes, adminRes] = await Promise.all([
              fetch("/api/auth/me", {
                headers: { Authorization: `Bearer ${session.access_token}` },
              }),
              fetch("/api/admin/check", {
                headers: { Authorization: `Bearer ${session.access_token}` },
              }),
            ]);
            let userIsAdmin = false;
            if (adminRes.ok) {
              const data = await adminRes.json();
              userIsAdmin = !!data.isAdmin;
              setIsAdmin(userIsAdmin);
            }
            if (profileRes.ok) {
              const data = await profileRes.json();
              setProfile(data);
              if (
                !userIsAdmin &&
                profileIncomplete(data) &&
                !SKIP_PROFILE_CHECK_PATHS.some((p) => window.location.pathname.startsWith(p))
              ) {
                window.location.href = "/complete-profile";
                return;
              }
            }
          } catch {
            // ignore
          }
        } else if (event === "SIGNED_OUT") {
          setSessionUser(null);
          setProfile(null);
          setIsAdmin(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    const handleClick = () => setUserMenuOpen(false);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [userMenuOpen]);

  // Close the click-pinned top-nav dropdown when the pointer clicks
  // anywhere outside the nav bar (including on a dropdown link, which
  // will still navigate before this handler runs).
  useEffect(() => {
    if (!openGroup) return;
    const handleClick = (e: MouseEvent) => {
      if (navGroupsRef.current && !navGroupsRef.current.contains(e.target as Node)) {
        setOpenGroup(null);
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [openGroup]);

  // Close any pinned dropdown on route change so it doesn't linger over
  // the next page.
  useEffect(() => {
    setOpenGroup(null);
  }, [pathname]);

  async function handleLogout() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    setSessionUser(null);
    setProfile(null);
    setIsAdmin(false);
    setUserMenuOpen(false);
    router.push("/");
  }

  const isLoggedIn = !!sessionUser;
  const displayName = profile?.full_name || sessionUser?.name || "User";
  const displayEmail = profile?.email || sessionUser?.email || "";
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

  return (
    <>
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolled
            ? "glass-strong shadow-lg"
            : "bg-white/90 backdrop-blur-sm border-b border-gray-100"
        }`}
      >
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo — circular VC mark. Replace /public/logo-vc.png (or
              .svg) to swap. */}
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <Image
              src="/logo-vc.svg"
              alt="Vending Connector"
              width={40}
              height={40}
              priority
              className="h-9 w-9"
            />
            <span className="whitespace-nowrap text-lg font-bold text-gray-900">Vending Connector</span>
          </Link>

          {/* Desktop Navigation — grouped dropdowns.
              Two triggers for the dropdown so it works for every input mode:
              - CSS :hover / :focus-within for pointer + keyboard users.
              - onClick that toggles openGroup for touch users and for the
                brief post-hydration window on dashboard where the main
                thread is busy and hover repaint lags. Adding a click
                path also stops iOS Safari from swallowing the first tap
                on the trigger. */}
          <ul ref={navGroupsRef} className="hidden items-center gap-0.5 xl:flex">
            {effectiveNavGroups.map((group) => {
              const isOpen = openGroup === group.label;
              return (
                <li key={group.label} className="relative group">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenGroup((prev) => (prev === group.label ? null : group.label));
                    }}
                    className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium transition-colors hover:bg-green-50 hover:text-green-primary group-focus-within:bg-green-50 group-focus-within:text-green-primary ${
                      isOpen ? "bg-green-50 text-green-primary" : "text-black-primary"
                    }`}
                    aria-haspopup="true"
                    aria-expanded={isOpen}
                  >
                    {group.label}
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform group-hover:rotate-180 group-focus-within:rotate-180 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  <div
                    className={`absolute left-0 top-full z-40 mt-1 w-72 rounded-2xl border border-gray-100 bg-white p-2 shadow-xl transition-all group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:opacity-100 ${
                      isOpen
                        ? "pointer-events-auto visible opacity-100"
                        : "pointer-events-none invisible opacity-0"
                    }`}
                  >
                    {group.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={false}
                        className="block rounded-lg px-3 py-2 transition-colors hover:bg-green-50"
                      >
                        <div className="text-sm font-semibold text-black-primary">{item.label}</div>
                        {item.description && (
                          <div className="mt-0.5 text-[11px] leading-snug text-gray-500">
                            {item.description}
                          </div>
                        )}
                      </Link>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Desktop Auth Buttons / User Menu */}
          <div className="hidden shrink-0 items-center gap-2 xl:flex">
            {isLoggedIn ? (
              <>
              <Tooltip content={TOOLTIP_COPY["Request Location Services"]}>
                <Link
                  href="/request-location"
                  className="whitespace-nowrap rounded-lg bg-green-primary px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-hover hover:shadow-md btn-press btn-shimmer"
                  aria-label={TOOLTIP_COPY["Request Location Services"]}
                  title={TOOLTIP_COPY["Request Location Services"]}
                >
                  Request Location Services
                </Link>
              </Tooltip>
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setUserMenuOpen(!userMenuOpen);
                  }}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-gray-50 cursor-pointer"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-primary text-xs font-bold text-white">
                    {initials}
                  </div>
                  <span className="text-sm font-medium text-black-primary">
                    {displayName.split(" ")[0] || "Account"}
                  </span>
                </button>

                {/* Dropdown */}
                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-gray-100 bg-white/95 backdrop-blur-md py-1 shadow-xl animate-fade-in">
                    <Link
                      href="/dashboard"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-black-primary transition-colors hover:bg-gray-50"
                      title={TOOLTIP_COPY["Dashboard"]}
                      aria-label={TOOLTIP_COPY["Dashboard"]}
                    >
                      <LayoutDashboard className="h-4 w-4 text-black-primary/50" />
                      Dashboard
                    </Link>
                    <Link
                      href="/your-leads"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-black-primary transition-colors hover:bg-gray-50"
                      title={TOOLTIP_COPY["Your Leads"]}
                      aria-label={TOOLTIP_COPY["Your Leads"]}
                    >
                      <ShoppingBag className="h-4 w-4 text-black-primary/50" />
                      Your Leads
                    </Link>
                    <Link
                      href="/saved-requests"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-black-primary transition-colors hover:bg-gray-50"
                      title="View your saved requests"
                      aria-label="View your saved requests"
                    >
                      <Heart className="h-4 w-4 text-black-primary/50" />
                      Saved Requests
                    </Link>
                    <Link
                      href="/account/agreements"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-black-primary transition-colors hover:bg-gray-50"
                      title="View and download your signed agreements"
                      aria-label="View and download your signed agreements"
                    >
                      <ScrollText className="h-4 w-4 text-black-primary/50" />
                      My Agreements
                    </Link>
                    <Link
                      href="/dashboard/profile"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-black-primary transition-colors hover:bg-gray-50"
                    >
                      <User className="h-4 w-4 text-black-primary/50" />
                      Profile
                    </Link>
                    <Link
                      href="/placement"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-black-primary transition-colors hover:bg-gray-50"
                      title={TOOLTIP_COPY["Placement Providers"]}
                      aria-label={TOOLTIP_COPY["Placement Providers"]}
                    >
                      <Briefcase className="h-4 w-4 text-black-primary/50" />
                      Placement Providers
                    </Link>
                    <Link
                      href="/website-builder"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-black-primary transition-colors hover:bg-gray-50"
                      title="Guided intake so our team can build a website tailored to your vending business"
                      aria-label="Get Your Own Vending Website"
                    >
                      <Globe className="h-4 w-4 text-black-primary/50" />
                      Get Your Own Vending Website
                    </Link>
                    {profile?.coffee_access_enabled && (
                      <Link
                        href="/coffee"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-black-primary transition-colors hover:bg-gray-50"
                      >
                        <Coffee className="h-4 w-4 text-black-primary/50" />
                        Coffee
                      </Link>
                    )}
                    {(isAdmin || profile?.role === "sales" || profile?.role === "director_of_sales" || profile?.role === "market_leader") && (
                      <Link
                        href="/sales"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-green-primary transition-colors hover:bg-green-50"
                      >
                        <Briefcase className="h-4 w-4" />
                        CRM
                      </Link>
                    )}
                    {isAdmin && (
                      <Link
                        href="/admin"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-green-primary transition-colors hover:bg-green-50"
                      >
                        <Shield className="h-4 w-4" />
                        Admin Panel
                      </Link>
                    )}
                    <hr className="my-1 border-gray-100" />
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-50 cursor-pointer"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
              </>
            ) : (
              <>
                <Tooltip content={TOOLTIP_COPY["Login"]}>
                  <Link
                    href="/login"
                    className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-black-primary transition-colors hover:bg-gray-50"
                    aria-label={TOOLTIP_COPY["Login"]}
                  >
                    Login
                  </Link>
                </Tooltip>
                <Tooltip content={TOOLTIP_COPY["Get Started"]}>
                  <Link
                    href="/signup"
                    className="whitespace-nowrap rounded-lg border border-green-primary/40 px-3.5 py-2 text-sm font-semibold text-green-primary transition-colors hover:border-green-primary hover:bg-green-50"
                    aria-label={TOOLTIP_COPY["Get Started"]}
                  >
                    Get Started
                  </Link>
                </Tooltip>
                <Tooltip content={TOOLTIP_COPY["Request Location Services"]}>
                  <Link
                    href="/request-location"
                    className="whitespace-nowrap rounded-lg bg-green-primary px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-hover hover:shadow-md btn-press btn-shimmer"
                    aria-label={TOOLTIP_COPY["Request Location Services"]}
                    title={TOOLTIP_COPY["Request Location Services"]}
                  >
                    Request Location Services
                  </Link>
                </Tooltip>
              </>
            )}
          </div>

          {/* Mobile Hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex items-center justify-center rounded-lg p-2 text-black-primary transition-colors hover:bg-gray-100 xl:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </button>
        </nav>
      </header>

      {/* Mobile Overlay — outside header to avoid stacking context issues */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[9990] bg-black/50 backdrop-blur-sm xl:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile Slide-out Drawer — outside header for proper z-index layering */}
      <div
        className={`fixed right-0 top-0 z-[9991] flex h-full w-[85vw] max-w-80 flex-col bg-green-primary shadow-2xl transition-all duration-300 ease-in-out xl:hidden ${
          mobileOpen ? "translate-x-0 visible opacity-100" : "translate-x-full invisible opacity-0"
        }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-white/20 px-4 py-4">
          <div className="flex items-center gap-2">
            {/* White background disc so the green ring + navy VC of
                the logo stay legible on the green drawer header. */}
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white p-0.5">
              <Image
                src="/logo-vc.svg"
                alt="Vending Connector"
                width={32}
                height={32}
                className="h-7 w-7"
              />
            </span>
            <span className="text-base font-bold text-white">Vending Connector</span>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-2 text-white/80 transition-colors hover:bg-white/10"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drawer Navigation Links */}
        <div className="flex-1 overflow-y-auto px-3 py-4">
          {/* User info if logged in */}
          {isLoggedIn && (
            <div className="mb-4 flex items-center gap-3 rounded-xl bg-white/15 px-3 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm font-bold text-green-primary">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {displayName}
                </p>
                <p className="truncate text-xs text-white/60">
                  {displayEmail}
                </p>
              </div>
            </div>
          )}

          <ul className="space-y-1">
            {NAV_GROUPS.map((group) => (
              <li key={group.label} className="pt-2 first:pt-0">
                <div className="mb-1 px-4 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                  {group.label}
                </div>
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center justify-between rounded-lg px-4 py-3 text-[15px] font-medium text-white transition-colors hover:bg-white/15"
                  >
                    {item.label}
                    <ChevronRight className="h-4 w-4 text-white/40" />
                  </Link>
                ))}
              </li>
            ))}

            {drawerExtraLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-between rounded-lg px-4 py-3 text-[15px] font-medium text-white transition-colors hover:bg-white/15"
                >
                  {link.label}
                  <ChevronRight className="h-4 w-4 text-white/40" />
                </Link>
              </li>
            ))}

            {isLoggedIn && (
              <>
                <li className="pt-2">
                  <div className="mb-1 px-4 text-[11px] font-semibold uppercase tracking-wider text-white/40">Account</div>
                </li>
                <li>
                  <Link
                    href="/dashboard"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center justify-between rounded-lg px-4 py-3 text-[15px] font-medium text-white transition-colors hover:bg-white/15"
                    aria-label={TOOLTIP_COPY["Dashboard"]}
                  >
                    <span className="flex items-center gap-2.5">
                      <LayoutDashboard className="h-4 w-4" />
                      Dashboard
                    </span>
                    <ChevronRight className="h-4 w-4 text-white/40" />
                  </Link>
                </li>
                <li>
                  <Link
                    href="/your-leads"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center justify-between rounded-lg px-4 py-3 text-[15px] font-medium text-white transition-colors hover:bg-white/15"
                    aria-label={TOOLTIP_COPY["Your Leads"]}
                  >
                    <span className="flex items-center gap-2.5">
                      <ShoppingBag className="h-4 w-4" />
                      Your Leads
                    </span>
                    <ChevronRight className="h-4 w-4 text-white/40" />
                  </Link>
                </li>
                <li>
                  <Link
                    href="/saved-requests"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center justify-between rounded-lg px-4 py-3 text-[15px] font-medium text-white transition-colors hover:bg-white/15"
                    aria-label="View your saved requests"
                  >
                    <span className="flex items-center gap-2.5">
                      <Heart className="h-4 w-4" />
                      Saved Requests
                    </span>
                    <ChevronRight className="h-4 w-4 text-white/40" />
                  </Link>
                </li>
                <li>
                  <Link
                    href="/placement"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center justify-between rounded-lg px-4 py-3 text-[15px] font-medium text-white transition-colors hover:bg-white/15"
                    aria-label={TOOLTIP_COPY["Placement Providers"]}
                  >
                    <span className="flex items-center gap-2.5">
                      <Briefcase className="h-4 w-4" />
                      Placement Providers
                    </span>
                    <ChevronRight className="h-4 w-4 text-white/40" />
                  </Link>
                </li>
                <li>
                  <Link
                    href="/website-builder"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center justify-between rounded-lg px-4 py-3 text-[15px] font-medium text-white transition-colors hover:bg-white/15"
                    aria-label="Get Your Own Vending Website"
                  >
                    <span className="flex items-center gap-2.5">
                      <Globe className="h-4 w-4" />
                      Get Your Own Vending Website
                    </span>
                    <ChevronRight className="h-4 w-4 text-white/40" />
                  </Link>
                </li>
                <li>
                  <Link
                    href="/account/agreements"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center justify-between rounded-lg px-4 py-3 text-[15px] font-medium text-white transition-colors hover:bg-white/15"
                    aria-label="View and download your signed agreements"
                  >
                    <span className="flex items-center gap-2.5">
                      <ScrollText className="h-4 w-4" />
                      My Agreements
                    </span>
                    <ChevronRight className="h-4 w-4 text-white/40" />
                  </Link>
                </li>
                {profile?.coffee_access_enabled && (
                  <li>
                    <Link
                      href="/coffee"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center justify-between rounded-lg px-4 py-3 text-[15px] font-medium text-white transition-colors hover:bg-white/15"
                    >
                      <span className="flex items-center gap-2.5">
                        <Coffee className="h-4 w-4" />
                        Coffee
                      </span>
                      <ChevronRight className="h-4 w-4 text-white/40" />
                    </Link>
                  </li>
                )}
                {(isAdmin || profile?.role === "sales" || profile?.role === "director_of_sales" || profile?.role === "market_leader") && (
                  <li>
                    <Link
                      href="/sales"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center justify-between rounded-lg px-4 py-3 text-[15px] font-medium text-white transition-colors hover:bg-white/15"
                    >
                      <span className="flex items-center gap-2.5">
                        <Briefcase className="h-4 w-4" />
                        CRM
                      </span>
                      <ChevronRight className="h-4 w-4 text-white/40" />
                    </Link>
                  </li>
                )}
                {isAdmin && (
                  <li>
                    <Link
                      href="/admin"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center justify-between rounded-lg px-4 py-3 text-[15px] font-medium text-white transition-colors hover:bg-white/15"
                    >
                      <span className="flex items-center gap-2.5">
                        <Shield className="h-4 w-4" />
                        Admin Panel
                      </span>
                      <ChevronRight className="h-4 w-4 text-white/40" />
                    </Link>
                  </li>
                )}
              </>
            )}
          </ul>
        </div>

        {/* Drawer Auth Buttons */}
        <div className="border-t border-white/20 px-4 py-4 space-y-3">
          {isLoggedIn ? (
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                handleLogout();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/30 bg-white/10 px-4 py-3 text-[15px] font-medium text-white transition-colors hover:bg-white/20 cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          ) : (
            <>
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="block w-full rounded-lg border border-white/30 bg-white/10 px-4 py-3 text-center text-[15px] font-medium text-white transition-colors hover:bg-white/20"
                aria-label={TOOLTIP_COPY["Login"]}
              >
                Login
              </Link>
              <Link
                href="/signup"
                onClick={() => setMobileOpen(false)}
                className="block w-full rounded-lg bg-white px-4 py-3 text-center text-[15px] font-semibold text-green-primary shadow-sm transition-colors hover:bg-green-50"
                aria-label={TOOLTIP_COPY["Get Started"]}
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  );
}
