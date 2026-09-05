"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useStorefrontBrand } from "@/lib/useStorefrontBrand";
import type { AuthBrand } from "@/lib/storefrontAuthContext";

function VerifyEmailContent({ initialBrand }: { initialBrand: AuthBrand | null }) {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  // Storefront-branded verification — the &storefront= param is
  // appended to the verify link for invited tenants. Server-seeded
  // (initialBrand) so branding is present on first paint and survives
  // a missing param via the durable vc_sf_ctx cookie.
  const storefrontSlug = searchParams.get("storefront") || initialBrand?.slug || null;
  const liveBrand = useStorefrontBrand(searchParams.get("storefront"));
  const brand = liveBrand ?? initialBrand;
  const loginHref = storefrontSlug
    ? `/login?storefront=${encodeURIComponent(storefrontSlug)}`
    : "/login";

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setErrorMsg("No verification token provided");
      return;
    }

    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok) {
          setStatus("success");
        } else {
          setStatus("error");
          setErrorMsg(data.error || "Verification failed");
        }
      })
      .catch(() => {
        setStatus("error");
        setErrorMsg("Network error. Please try again.");
      });
  }, [searchParams]);

  return (
    <div className="min-h-[calc(100vh-160px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {brand ? (
          <div className="text-center mb-6">
            {brand.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brand.logo_url}
                alt={`${brand.display_name} logo`}
                className="mx-auto mb-3 h-12 w-auto"
              />
            ) : null}
            <div className="text-lg font-semibold text-black-primary">{brand.display_name}</div>
            <div className="text-xs text-black-primary/40">Powered by Vending Connector</div>
          </div>
        ) : null}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          {status === "loading" && (
            <>
              <Loader2 className="w-12 h-12 animate-spin text-green-primary mx-auto mb-4" />
              <h1 className="text-xl font-bold text-black-primary">Verifying your email...</h1>
            </>
          )}

          {status === "success" && (
            <>
              <div className="mx-auto w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-6">
                <CheckCircle2 className="w-8 h-8 text-green-primary" />
              </div>
              <h1 className="text-2xl font-bold text-black-primary mb-2">Email verified!</h1>
              <p className="text-sm text-black-primary/60 mb-6">
                {brand
                  ? `Your email has been verified. Sign in to start ordering from ${brand.display_name}.`
                  : "Your email has been verified. You can now sign in to your account."}
              </p>
              <Link
                href={loginHref}
                className={`block w-full py-3 px-4 font-semibold rounded-xl transition-colors ${brand ? "" : "bg-green-primary hover:bg-green-hover text-white"}`}
                style={brand ? { background: brand.primary_color, color: brand.accent_color } : undefined}
              >
                Sign In
              </Link>
            </>
          )}

          {status === "error" && (
            <>
              <div className="mx-auto w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-6">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h1 className="text-2xl font-bold text-black-primary mb-2">Verification failed</h1>
              <p className="text-sm text-red-700 mb-6">{errorMsg}</p>
              <div className="space-y-3">
                <Link
                  href="/resend-verification"
                  className="block w-full py-3 px-4 bg-green-primary hover:bg-green-hover text-white font-semibold rounded-xl transition-colors"
                >
                  Request new verification link
                </Link>
                <Link
                  href={loginHref}
                  className="block w-full py-3 px-4 text-sm text-black-primary/60 hover:text-black-primary transition-colors"
                >
                  Back to login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailClient({ initialBrand }: { initialBrand: AuthBrand | null }) {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent initialBrand={initialBrand} />
    </Suspense>
  );
}
