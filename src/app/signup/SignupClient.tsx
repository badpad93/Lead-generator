"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Truck, Building2, Search, Loader2, LogOut, Briefcase } from "lucide-react";
import {
  signUpWithGoogle,
  signUpWithMicrosoft,
  signUpWithYahoo,
  storeSignupRole,
  storeSignupLead,
  storeRedirectAfterLogin,
  storeInviteToken,
  ensureSignedOut,
} from "@/lib/auth";
import { createBrowserClient } from "@/lib/supabase";
import { US_STATES } from "@/lib/types";
import type { AuthBrand } from "@/lib/storefrontAuthContext";

// "customer" is the storefront-invite role: an invited coffee
// customer of an operator's storefront. It is never offered as a
// chip — it's forced when the page runs in storefront mode (an
// invite_token is present) so a tenant can't accidentally sign up
// as an operator/locator and unlock the wrong UI.
type Role = "operator" | "locator" | "location_manager" | "employee" | "customer";

const roles: { value: Role; label: string; icon: typeof Truck }[] = [
  { value: "operator", label: "Operator", icon: Truck },
  { value: "locator", label: "Locator", icon: Search },
  { value: "location_manager", label: "Location Manager", icon: Building2 },
  { value: "employee", label: "Employee", icon: Briefcase },
];

interface StorefrontBrandSummary {
  slug: string;
  display_name: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
}

export default function SignupClient({ initialBrand }: { initialBrand: AuthBrand | null }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-160px)] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-green-primary" />
        </div>
      }
    >
      <SignupContent initialBrand={initialBrand} />
    </Suspense>
  );
}

function SignupContent({ initialBrand }: { initialBrand: AuthBrand | null }) {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";
  const roleParam = searchParams.get("role");
  // Storefront invitation flow (Option B). When a signed-out visitor
  // hits Accept on /coffee/invite/{token} they land here with
  // ?invite_token=… so the auth callback can consume it after the
  // session lands. Stash into localStorage + cookie so it survives
  // /check-email + OAuth redirects. Server-validated at consume
  // time — the query string is trusted here only to know we should
  // TRY the consume, not to grant enrollment.
  const inviteTokenParam = searchParams.get("invite_token");
  useEffect(() => {
    if (inviteTokenParam) storeInviteToken(inviteTokenParam);
  }, [inviteTokenParam]);
  // Storefront mode: an invite token means this visitor is an
  // operator's coffee customer. No role choice — they're a
  // "customer", full stop — and the page dresses itself in the
  // operator's brand (fetched below from the public, token-scoped
  // preview endpoint).
  const storefrontMode = !!inviteTokenParam;
  const presetRole: Role = storefrontMode
    ? "customer"
    : roleParam === "locator"
      ? "locator"
      : roleParam === "location_manager"
        ? "location_manager"
        : roleParam === "employee"
          ? "employee"
          : "operator";

  const [role, setRole] = useState<Role>(presetRole);
  // Server-seeded operator brand (resolved from ?invite_token= /
  // ?storefront= / vc_sf_ctx before render) so signup is branded on
  // first paint — no generic→operator flash.
  const [storefront, setStorefront] = useState<StorefrontBrandSummary | null>(initialBrand);

  // Establish the durable branding context for the invite-token entry
  // path (which carries no ?storefront=), so later bare screens
  // (/login, check-email) stay operator-branded. Branding only.
  useEffect(() => {
    const slug = storefront?.slug;
    if (!slug) return;
    document.cookie = `vc_sf_ctx=${encodeURIComponent(slug)};path=/;max-age=${60 * 60 * 24 * 30};SameSite=Lax`;
  }, [storefront?.slug]);

  useEffect(() => {
    if (!inviteTokenParam) return;
    let cancelled = false;
    fetch(`/api/storefront/enrollment/preview?token=${encodeURIComponent(inviteTokenParam)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (data: {
          tenant?: { slug: string; display_name: string; brand?: Record<string, unknown> };
        } | null) => {
          if (cancelled || !data?.tenant) return;
          const brand = data.tenant.brand ?? {};
          setStorefront({
            slug: data.tenant.slug,
            display_name: data.tenant.display_name,
            logo_url: (brand.logo_url as string) || null,
            primary_color: (brand.primary_color as string) || "#1a1a1a",
            accent_color: (brand.accent_color as string) || "#c4a877",
          });
        },
      )
      .catch(() => {
        // Preview failure is non-fatal — the page still works as a
        // customer signup, just without the operator's branding.
      });
    return () => {
      cancelled = true;
    };
  }, [inviteTokenParam]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [salesRepName, setSalesRepName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState<"google" | "microsoft" | "yahoo" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [existingEmail, setExistingEmail] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) {
        setExistingEmail(session.user.email);
      }
    });
  }, []);

  useEffect(() => {
    const urlError = searchParams.get("error");
    if (urlError) setError(decodeURIComponent(urlError));
  }, [searchParams]);

  async function handleSignOutAndContinue() {
    setSigningOut(true);
    try {
      const cleared = await ensureSignedOut();
      if (!cleared) {
        setError("Failed to fully sign out. Please refresh and try again.");
        setSigningOut(false);
        return;
      }
      setExistingEmail(null);
    } catch {
      setError("Failed to sign out. Please try again.");
    }
    setSigningOut(false);
  }

  // Stash whatever we have so the OAuth callback can patch the new profile.
  // Address is required for email/password but may be blank for OAuth users
  // — /complete-profile catches them via the middleware address gate.
  // Storefront customers are NOT stashed as CRM sales leads — they're an
  // operator's customer, not a Vending Connector prospect.
  function storeLead() {
    if (storefrontMode) return;
    storeSignupLead({
      business_name: companyName,
      contact_name: `${firstName} ${lastName}`.trim(),
      email,
      phone,
      address,
      city,
      state,
      zip,
      entity_type: role === "operator" ? "operator" : role === "locator" ? "locator" : "location",
      immediate_need: "",
    });
  }

  async function handleEmailSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!firstName.trim()) return setError("First name is required");
    if (!lastName.trim()) return setError("Last name is required");
    if (!email.trim()) return setError("Email is required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Please enter a valid email address");
    if (!phone.trim()) return setError("Phone number is required");
    if (phone.replace(/\D/g, "").length < 10) return setError("Please enter a valid phone number");
    if (!address.trim()) return setError("Street address is required");
    if (!city.trim()) return setError("City is required");
    if (!state.trim()) return setError("State is required");
    if (!zip.trim()) return setError("Zip code is required");
    if (zip.replace(/\D/g, "").length < 5) return setError("Please enter a valid zip code");
    if (!password || password.length < 8) return setError("Password must be at least 8 characters");
    if (password !== confirmPassword) return setError("Passwords do not match");

    setLoading("email");
    try {
      const cleared = await ensureSignedOut();
      if (!cleared) {
        setError("Could not clear existing session. Please refresh and try again.");
        setLoading(null);
        return;
      }
      setExistingEmail(null);

      const res = await fetch("/api/auth/signup-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          company_name: companyName.trim(),
          sales_rep_name: salesRepName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          address: address.trim(),
          city: city.trim(),
          state: state.trim(),
          zip: zip.trim(),
          password,
          role,
          // Storefront mode: brands the verification email + the
          // check-email/verify/login pages with the operator's
          // identity end to end.
          storefront_slug: storefront?.slug ?? null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to create account");
        setLoading(null);
        return;
      }

      storeSignupRole(role);
      storeLead();
      // Best-effort: stash a minimal lead record (no required fields, so
      // failures are OK). Skipped for storefront customers — not leads.
      if (!storefrontMode) {
        try {
          await fetch("/api/auth/signup-lead", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              first_name: firstName,
              last_name: lastName,
              business_name: companyName,
              email,
              role,
            }),
          });
        } catch {}
      }

      window.location.href = `/check-email?email=${encodeURIComponent(email.trim().toLowerCase())}${storefront ? `&storefront=${encodeURIComponent(storefront.slug)}` : ""}`;
    } catch {
      setError("Failed to create account. Please try again.");
      setLoading(null);
    }
  }

  async function handleGoogleSignup() {
    setLoading("google");
    setError(null);
    try {
      const cleared = await ensureSignedOut();
      if (!cleared) {
        setError("Could not clear existing session. Please refresh and try again.");
        setLoading(null);
        return;
      }
      setExistingEmail(null);
      storeSignupRole(role);
      storeLead();
      storeRedirectAfterLogin(redirectTo);
      await signUpWithGoogle(role);
    } catch {
      setError("Failed to connect to Google. Please try again.");
      setLoading(null);
    }
  }

  async function handleMicrosoftSignup() {
    setLoading("microsoft");
    setError(null);
    try {
      const cleared = await ensureSignedOut();
      if (!cleared) {
        setError("Could not clear existing session. Please refresh and try again.");
        setLoading(null);
        return;
      }
      setExistingEmail(null);
      storeSignupRole(role);
      storeLead();
      storeRedirectAfterLogin(redirectTo);
      await signUpWithMicrosoft(role);
    } catch {
      setError("Failed to connect to Microsoft. Please try again.");
      setLoading(null);
    }
  }

  async function handleYahooSignup() {
    setLoading("yahoo");
    setError(null);
    try {
      const cleared = await ensureSignedOut();
      if (!cleared) {
        setError("Could not clear existing session. Please refresh and try again.");
        setLoading(null);
        return;
      }
      setExistingEmail(null);
      storeSignupRole(role);
      storeLead();
      storeRedirectAfterLogin(redirectTo);
      signUpWithYahoo(role);
    } catch {
      setError("Failed to connect to Yahoo. Please try again.");
      setLoading(null);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary/30 transition-colors disabled:bg-gray-50";

  return (
    <div className="min-h-[calc(100vh-160px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Header — storefront mode wears the operator's brand:
            their logo + name front and center, Vending Connector
            demoted to a "powered by" footnote. The customer knows
            and trusts THEIR operator, not us. */}
        {storefrontMode ? (
          <div className="text-center mb-8">
            {storefront?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={storefront.logo_url}
                alt={`${storefront.display_name} logo`}
                className="mx-auto mb-4 h-14 w-auto"
              />
            ) : null}
            <h1 className="text-2xl font-bold text-black-primary sm:text-3xl">
              {storefront
                ? `Create your ${storefront.display_name} account`
                : "Create your account"}
            </h1>
            <p className="text-black-primary/60 mt-2">
              {storefront
                ? `One account, permanently linked to ${storefront.display_name}'s coffee shop`
                : "Set up your account to start ordering"}
            </p>
            <p className="mt-1 text-xs text-black-primary/40">
              Powered by Vending Connector
            </p>
          </div>
        ) : (
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-black-primary sm:text-3xl">Create your account</h1>
            <p className="text-black-primary/60 mt-2">Join Vending Connector in under a minute</p>
          </div>
        )}

        {/* Existing session banner */}
        {existingEmail && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
            <p className="text-sm text-amber-800">
              You&apos;re currently signed in as <strong>{existingEmail}</strong>.
            </p>
            <button
              type="button"
              onClick={handleSignOutAndContinue}
              disabled={signingOut}
              className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
            >
              {signingOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
              Sign out
            </button>
          </div>
        )}

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Role chip selector — NEVER rendered in storefront mode.
              An invited customer has exactly one identity (customer)
              and offering Operator/Locator chips here is how tenants
              ended up with operator roles and the wrong UI. */}
          {!storefrontMode && (
            <div className="mb-5">
              <label className="block text-xs font-medium text-gray-600 mb-2">I&apos;m signing up as</label>
              <div className="flex flex-wrap gap-2">
                {roles.map((r) => {
                  const Icon = r.icon;
                  const active = role === r.value;
                  return (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setRole(r.value)}
                      disabled={!!loading}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                        active
                          ? "bg-green-primary text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Email/Password Signup (primary) */}
          <form onSubmit={handleEmailSignup} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">First Name <span className="text-red-500">*</span></label>
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={!!loading} placeholder="First name" className={inputClass} autoComplete="given-name" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Last Name <span className="text-red-500">*</span></label>
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={!!loading} placeholder="Last name" className={inputClass} autoComplete="family-name" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Company <span className="text-gray-400 text-[10px]">(optional)</span></label>
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={!!loading} placeholder="Your company name" className={inputClass} autoComplete="organization" />
            </div>

            {/* Sales-rep attribution is a Vending Connector lead-gen
                field — meaningless for a storefront customer invited
                by their operator, so it's hidden in storefront mode. */}
            {!storefrontMode && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Name of Sales Rep <span className="text-gray-400 text-[10px]">(optional)</span>
                </label>
                <input
                  value={salesRepName}
                  onChange={(e) => setSalesRepName(e.target.value)}
                  disabled={!!loading}
                  placeholder="Who told you about us?"
                  className={inputClass}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email <span className="text-red-500">*</span></label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!loading} placeholder="you@example.com" className={inputClass} autoComplete="email" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone <span className="text-red-500">*</span></label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!!loading} placeholder="(555) 123-4567" className={inputClass} autoComplete="tel" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Street Address <span className="text-red-500">*</span></label>
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} disabled={!!loading} placeholder="123 Main St" className={inputClass} autoComplete="street-address" />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">City <span className="text-red-500">*</span></label>
                <input type="text" value={city} onChange={(e) => setCity(e.target.value)} disabled={!!loading} placeholder="City" className={inputClass} autoComplete="address-level2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">State <span className="text-red-500">*</span></label>
                <select value={state} onChange={(e) => setState(e.target.value)} disabled={!!loading} className={inputClass} autoComplete="address-level1">
                  <option value="">--</option>
                  {US_STATES.map((s) => (<option key={s} value={s}>{s}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Zip <span className="text-red-500">*</span></label>
                <input type="text" value={zip} onChange={(e) => setZip(e.target.value)} disabled={!!loading} placeholder="75001" maxLength={10} className={inputClass} autoComplete="postal-code" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password <span className="text-red-500">*</span></label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={!!loading} placeholder="At least 8 characters" className={inputClass} autoComplete="new-password" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Confirm Password <span className="text-red-500">*</span></label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={!!loading} placeholder="Re-enter your password" className={inputClass} autoComplete="new-password" />
            </div>

            <button
              type="submit"
              disabled={!!loading}
              className={`w-full py-3 px-4 font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer ${
                storefront ? "" : "bg-green-primary hover:bg-green-hover text-white"
              }`}
              style={
                storefront
                  ? { background: storefront.primary_color, color: storefront.accent_color }
                  : undefined
              }
            >
              {loading === "email" ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Creating account...</>
              ) : (
                "Create Account"
              )}
            </button>

            <p className="text-xs text-black-primary/40 text-center">
              We&apos;ll email you a verification link to confirm your address.
            </p>
          </form>

          <p className="mt-4 text-center text-sm text-black-primary/60">
            Already have an account?{" "}
            <a
              href={
                storefront ? `/login?storefront=${encodeURIComponent(storefront.slug)}` : "/login"
              }
              className="text-green-primary hover:underline font-medium"
            >
              Sign in
            </a>
          </p>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-gray-400">or sign up with</span></div>
          </div>

          {/* OAuth buttons (secondary) */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleGoogleSignup}
              disabled={!!loading}
              className="w-full py-3 px-4 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 cursor-pointer border border-gray-300 shadow-sm"
            >
              {loading === "google" ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Connecting to Google...</>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleMicrosoftSignup}
              disabled={!!loading}
              className="w-full py-3 px-4 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 cursor-pointer border border-gray-300 shadow-sm"
            >
              {loading === "microsoft" ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Connecting to Microsoft...</>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 21 21">
                    <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                    <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                    <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                    <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                  </svg>
                  Continue with Microsoft
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleYahooSignup}
              disabled={!!loading}
              className="w-full py-3 px-4 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 cursor-pointer border border-gray-300 shadow-sm"
            >
              {loading === "yahoo" ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Connecting to Yahoo...</>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M13.31 9.693l4.655-9.693h-3.516l-2.889 6.487L8.682 0H5.168l4.61 9.693L9.047 24h3.476l.787-14.307z" fill="#6001D2"/>
                  </svg>
                  Continue with Yahoo
                </>
              )}
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-xs text-black-primary/40">
              By signing up, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
