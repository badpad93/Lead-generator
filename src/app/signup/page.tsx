"use client";

import { useState } from "react";
import Link from "next/link";
import { Truck, Building2, UserPlus, ArrowLeft, Loader2 } from "lucide-react";
import { signInWithGitHub, storeSignupRole } from "@/lib/auth";

type Role = "operator" | "location_manager" | "requestor";

const roles: { value: Role; label: string; icon: typeof Truck; description: string }[] = [
  {
    value: "operator",
    label: "Operator",
    icon: Truck,
    description: "I own/operate vending machines and want new locations",
  },
  {
    value: "location_manager",
    label: "Location Manager",
    icon: Building2,
    description: "I manage a property and want a vending machine",
  },
  {
    value: "requestor",
    label: "Requestor",
    icon: UserPlus,
    description: "I want to request a vending machine for a location I frequent",
  },
];

export default function SignupPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleRoleSelect(selected: Role) {
    setRole(selected);
    setStep(2);
    setError(null);
  }

  function handleBack() {
    setStep(1);
    setError(null);
  }

  async function handleGitHubSignup() {
    if (!role) return;
    setLoading(true);
    setError(null);

    try {
      // Store the selected role before redirecting to GitHub
      storeSignupRole(role);
      await signInWithGitHub();
    } catch {
      setError("Failed to connect to GitHub. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-160px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-black-primary">Join VendHub</h1>
          <p className="text-black-primary/60 mt-2">
            {step === 1
              ? "Select your role to get started"
              : "Connect your GitHub account to continue"}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {/* Error alert */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Role Selection */}
          {step === 1 && (
            <div className="space-y-4">
              {roles.map(({ value, label, icon: Icon, description }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleRoleSelect(value)}
                  className="w-full flex items-start gap-4 p-5 rounded-xl border-2 border-gray-100
                    hover:border-green-primary hover:bg-light-warm/50 transition-all duration-200
                    text-left cursor-pointer group"
                >
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-light-warm flex items-center justify-center
                    group-hover:bg-green-primary/10 transition-colors">
                    <Icon className="w-6 h-6 text-green-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-black-primary">{label}</p>
                    <p className="text-sm text-black-primary/60 mt-0.5">{description}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Step 2: GitHub OAuth */}
          {step === 2 && (
            <>
              {/* Back button */}
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-1.5 text-sm text-black-primary/60 hover:text-green-primary
                  transition-colors mb-6 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Change role
              </button>

              {/* Selected role badge */}
              <div className="flex items-center gap-2 mb-6 px-3 py-2 bg-light-warm rounded-lg w-fit">
                {(() => {
                  const selected = roles.find((r) => r.value === role);
                  if (!selected) return null;
                  const Icon = selected.icon;
                  return (
                    <>
                      <Icon className="w-4 h-4 text-green-primary" />
                      <span className="text-sm font-medium text-black-primary">{selected.label}</span>
                    </>
                  );
                })()}
              </div>

              {/* GitHub OAuth Button */}
              <button
                type="button"
                onClick={handleGitHubSignup}
                disabled={loading}
                className="w-full py-3 px-4 bg-black-primary hover:bg-black-light text-white
                  font-semibold rounded-xl transition-colors disabled:opacity-50
                  disabled:cursor-not-allowed flex items-center justify-center gap-3 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Connecting to GitHub...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    Sign up with GitHub
                  </>
                )}
              </button>

              <div className="mt-6 text-center">
                <p className="text-xs text-black-primary/40">
                  By signing up, you agree to our Terms of Service and Privacy Policy.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer link */}
        <p className="text-center mt-6 text-sm text-black-primary/60">
          Already have an account?{" "}
          <Link href="/login" className="text-green-primary hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
