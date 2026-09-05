"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mail } from "lucide-react";
import { useStorefrontBrand } from "@/lib/useStorefrontBrand";
import AuthBrandHeader from "@/app/components/AuthBrandHeader";
import type { AuthBrand } from "@/lib/storefrontAuthContext";

function CheckEmailContent({ initialBrand }: { initialBrand: AuthBrand | null }) {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  // Storefront-branded when the signup carried a tenant slug — an
  // invited customer sees their operator's identity through the
  // whole verification leg. Server-seeded (initialBrand) so it's
  // present on first paint and survives a missing ?storefront= param.
  const storefrontSlug = searchParams.get("storefront") || initialBrand?.slug || null;
  const liveBrand = useStorefrontBrand(searchParams.get("storefront"));
  const brand: AuthBrand | null = liveBrand ?? initialBrand;
  const loginHref = storefrontSlug
    ? `/login?storefront=${encodeURIComponent(storefrontSlug)}`
    : "/login";

  return (
    <div className="min-h-[calc(100vh-160px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <AuthBrandHeader brand={brand} />
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-6">
            <Mail className="w-8 h-8 text-green-primary" />
          </div>
          <h1 className="text-2xl font-bold text-black-primary mb-2">Check your email</h1>
          <p className="text-sm text-black-primary/60 mb-6">
            We&apos;ve sent a verification link to {email ? (
              <strong className="text-black-primary">{email}</strong>
            ) : (
              "your inbox"
            )}. Click the link in the email to verify your account.
          </p>
          <div className="space-y-3">
            <Link
              href={`/resend-verification?${[
                email ? `email=${encodeURIComponent(email)}` : "",
                storefrontSlug ? `storefront=${encodeURIComponent(storefrontSlug)}` : "",
              ]
                .filter(Boolean)
                .join("&")}`}
              className="block w-full py-3 px-4 border border-gray-200 text-black-primary hover:bg-gray-50 font-medium rounded-xl transition-colors"
            >
              Resend verification email
            </Link>
            <Link
              href={loginHref}
              className="block w-full py-3 px-4 text-sm text-black-primary/60 hover:text-black-primary transition-colors"
            >
              Back to login
            </Link>
          </div>
          <p className="mt-6 text-xs text-black-primary/40">
            Didn&apos;t get the email? Check your spam folder.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CheckEmailClient({ initialBrand }: { initialBrand: AuthBrand | null }) {
  return (
    <Suspense fallback={null}>
      <CheckEmailContent initialBrand={initialBrand} />
    </Suspense>
  );
}
