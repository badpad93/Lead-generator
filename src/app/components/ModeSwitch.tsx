"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Legacy Mode / AI Mode selector: two text tabs, nothing else.
 *
 * Discoverability only: two ordinary links, never a gate. The proxy and
 * the /assistant page keep enforcing access; this component only decides
 * what to show and where each option points.
 *
 * - Active state comes from the current route alone: /assistant (and any
 *   path under it) is AI Mode, everything else is Legacy Mode. Nothing is
 *   remembered in a cookie, storage, or profile, so everyone lands on the
 *   Dashboard side until they click AI Mode.
 * - Guests reach the Dashboard through /login?redirect=/dashboard.
 * - The whole selector renders only when assistant.enabled is true. While
 *   the status is unknown or false an invisible spacer with the same text
 *   holds the place, so the bar never shifts when the answer arrives.
 * - Active is shown three ways (weight, a 2px Vinnie-green underline, and
 *   aria-current), never by colour alone. No icons, images, or capsules.
 */
export type ModeSwitchTone = "light" | "dark";
export type Mode = "dashboard" | "vinnie";

export const DASHBOARD_HREF = "/dashboard";
export const GUEST_DASHBOARD_HREF = "/login?redirect=/dashboard";
export const VINNIE_HREF = "/assistant";
export const DASHBOARD_LABEL = "Legacy Mode";
export const VINNIE_LABEL = "AI Mode";

export function activeMode(pathname: string | null | undefined): Mode {
  return pathname === VINNIE_HREF || pathname?.startsWith(`${VINNIE_HREF}/`) ? "vinnie" : "dashboard";
}

export function dashboardHref(authenticated: boolean): string {
  return authenticated ? DASHBOARD_HREF : GUEST_DASHBOARD_HREF;
}

/** 44px tall click target, transparent, underline reserved so the active state never resizes. */
const TAB = "inline-flex min-h-11 items-center whitespace-nowrap rounded-[6px] border-b-2 px-1 pt-0.5 text-xs transition-colors sm:px-1.5 sm:text-sm";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vinnie-green focus-visible:ring-offset-2";
const TONE: Record<ModeSwitchTone, { idle: string; active: string; divider: string; offset: string }> = {
  light: { idle: "border-transparent font-medium text-gray-500 hover:text-black-primary", active: "border-vinnie-green font-semibold text-black-primary", divider: "bg-gray-200", offset: "focus-visible:ring-offset-white" },
  dark: { idle: "border-transparent font-medium text-neutral-400 hover:text-white", active: "border-vinnie-green font-semibold text-white", divider: "bg-neutral-700", offset: "focus-visible:ring-offset-black" },
};

interface OptionProps {
  href: string;
  label: string;
  active: boolean;
  tone: ModeSwitchTone;
  testId: string;
}

function Option({ href, label, active, tone, testId }: OptionProps) {
  const t = TONE[tone];
  return (
    <Link href={href} prefetch={false} aria-current={active ? "page" : undefined} data-testid={testId} data-active={active ? "true" : "false"} className={`${TAB} ${FOCUS} ${t.offset} ${active ? t.active : t.idle}`}>
      {label}
    </Link>
  );
}

export interface ModeSwitchProps {
  /** Signed-in viewers go straight to /dashboard; guests through login. */
  authenticated: boolean;
  /** assistant.enabled: true shows the selector, false hides it, null means still loading (place reserved). */
  vinnieEnabled: boolean | null;
  tone?: ModeSwitchTone;
  className?: string;
}

const GROUP = "flex items-center gap-1";

export function ModeSwitch({ authenticated, vinnieEnabled, tone = "light", className = "" }: ModeSwitchProps) {
  const mode = activeMode(usePathname());
  if (vinnieEnabled !== true) {
    // Same text, same metrics, no links, no focus stops: holds the space until the flag says on.
    return (
      <div aria-hidden="true" data-testid="mode-switch-placeholder" className={`${GROUP} invisible ${className}`}>
        <span className={`${TAB} border-transparent font-semibold`}>{DASHBOARD_LABEL}</span>
        <span className="mx-1 h-4 w-px" />
        <span className={`${TAB} border-transparent font-semibold`}>{VINNIE_LABEL}</span>
      </div>
    );
  }
  return (
    // A labelled group rather than a second <nav> landmark: the global
    // Navbar already owns navigation, and Vinnie's shell has none by design.
    <div role="group" aria-label="Interface mode" data-testid="mode-switch" className={`${GROUP} ${className}`}>
      <Option href={dashboardHref(authenticated)} label={DASHBOARD_LABEL} active={mode === "dashboard"} tone={tone} testId="mode-switch-dashboard" />
      <span aria-hidden="true" className={`mx-1 h-4 w-px ${TONE[tone].divider}`} />
      <Option href={VINNIE_HREF} label={VINNIE_LABEL} active={mode === "vinnie"} tone={tone} testId="mode-switch-vinnie" />
    </div>
  );
}
