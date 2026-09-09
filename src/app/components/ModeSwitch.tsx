"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, LayoutDashboard } from "lucide-react";

/**
 * Dashboard / Vinnie AI mode switch.
 *
 * Discoverability only: two ordinary links, never a gate. The proxy and
 * the /assistant page keep enforcing access; this component only decides
 * what to show and where each option points.
 *
 * - Active state comes from the current route alone: /assistant (and any
 *   path under it) is Vinnie, everything else is Dashboard. Nothing is
 *   remembered in a cookie, storage, or profile, so everyone lands on the
 *   Dashboard side until they click Vinnie.
 * - Guests reach the Dashboard through /login?redirect=/dashboard.
 * - The Vinnie option renders only when assistant.enabled is true. While
 *   the status is unknown or false the slot stays reserved and inert, so
 *   the bar never shifts when the answer arrives.
 * - Below the sm breakpoint it collapses to a compact icon-only pair; the
 *   accessible name stays on each link.
 */
export type ModeSwitchTone = "light" | "dark";
export type Mode = "dashboard" | "vinnie";

export const DASHBOARD_HREF = "/dashboard";
export const GUEST_DASHBOARD_HREF = "/login?redirect=/dashboard";
export const VINNIE_HREF = "/assistant";
export const DASHBOARD_LABEL = "Dashboard";
export const VINNIE_LABEL = "Vinnie AI";

export function activeMode(pathname: string | null | undefined): Mode {
  return pathname === VINNIE_HREF || pathname?.startsWith(`${VINNIE_HREF}/`) ? "vinnie" : "dashboard";
}

export function dashboardHref(authenticated: boolean): string {
  return authenticated ? DASHBOARD_HREF : GUEST_DASHBOARD_HREF;
}

const SLOT = "inline-flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 rounded-full border text-xs font-semibold transition-colors sm:h-8 sm:w-24 sm:text-sm";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vinnie-green focus-visible:ring-offset-2";
/**
 * Active state is always the Vinnie green. On the light site chrome it is
 * a filled pill; inside Vinnie's monochrome shell the accent never paints
 * a surface (only borders, icons, and text), so there it is an outlined
 * pill. Every option carries a border so switching state never resizes.
 */
const TONE: Record<ModeSwitchTone, { track: string; idle: string; active: string; offset: string }> = {
  light: { track: "border-gray-200 bg-white", idle: "border-transparent text-black-primary hover:bg-gray-100", active: "border-vinnie-green bg-vinnie-green text-black", offset: "focus-visible:ring-offset-white" },
  dark: { track: "border-neutral-800 bg-neutral-950", idle: "border-transparent text-white hover:bg-neutral-800", active: "border-vinnie-green bg-black text-vinnie-green", offset: "focus-visible:ring-offset-black" },
};

interface OptionProps {
  href: string;
  label: string;
  icon: typeof Bot;
  active: boolean;
  tone: ModeSwitchTone;
  testId: string;
}

function Option({ href, label, icon: Icon, active, tone, testId }: OptionProps) {
  const t = TONE[tone];
  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      title={label}
      data-testid={testId}
      data-active={active ? "true" : "false"}
      className={`${SLOT} ${FOCUS} ${t.offset} ${active ? t.active : t.idle}`}
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}

export interface ModeSwitchProps {
  /** Signed-in viewers go straight to /dashboard; guests through login. */
  authenticated: boolean;
  /** assistant.enabled: true shows Vinnie, false hides it, null means still loading (slot reserved). */
  vinnieEnabled: boolean | null;
  tone?: ModeSwitchTone;
  className?: string;
}

export function ModeSwitch({ authenticated, vinnieEnabled, tone = "light", className = "" }: ModeSwitchProps) {
  const mode = activeMode(usePathname());
  const showVinnie = vinnieEnabled === true;
  const track = showVinnie ? `border ${TONE[tone].track}` : "border border-transparent";
  return (
    // A labelled group rather than a second <nav> landmark: the global
    // Navbar already owns navigation, and Vinnie's shell has none by design.
    <div role="group" aria-label="Interface mode" data-testid="mode-switch" data-vinnie={showVinnie ? "on" : "off"} className={`flex items-center gap-0.5 rounded-full p-0.5 ${track} ${className}`}>
      <Option href={dashboardHref(authenticated)} label={DASHBOARD_LABEL} icon={LayoutDashboard} active={mode === "dashboard"} tone={tone} testId="mode-switch-dashboard" />
      {showVinnie ? (
        <Option href={VINNIE_HREF} label={VINNIE_LABEL} icon={Bot} active={mode === "vinnie"} tone={tone} testId="mode-switch-vinnie" />
      ) : (
        <span className={`${SLOT} invisible`} aria-hidden="true" data-testid="mode-switch-vinnie-slot" />
      )}
    </div>
  );
}
