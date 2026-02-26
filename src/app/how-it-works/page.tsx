"use client";

import Link from "next/link";
import {
  ClipboardList,
  Search,
  MessageSquare,
  CheckCircle2,
  Truck,
  Building2,
  UserPlus,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from "lucide-react";
import { useState } from "react";

const STEPS = [
  {
    icon: ClipboardList,
    title: "Post Your Location or Listing",
    desc: "Describe your space, foot traffic, and what type of vending machine you need — or list your available machines as an operator.",
  },
  {
    icon: Search,
    title: "Get Discovered",
    desc: "Operators browse open requests. Location managers browse operator profiles. Our matching helps connect the right people.",
  },
  {
    icon: MessageSquare,
    title: "Connect & Negotiate",
    desc: "Chat directly on the platform. Discuss commission terms, machine types, installation timelines, and more.",
  },
  {
    icon: CheckCircle2,
    title: "Machine Gets Installed",
    desc: "Finalize the deal, schedule installation, and start generating revenue. Leave a review to help the community.",
  },
];

const ROLES = [
  {
    icon: Truck,
    title: "Vending Operators",
    color: "bg-green-50 text-green-primary",
    items: [
      "Browse hundreds of open location requests",
      "Filter by city, state, location type, and traffic",
      "Apply directly to locations that match your service area",
      "Manage all your applications in one dashboard",
      "Get verified to stand out from competitors",
      "Receive messages and negotiate terms",
    ],
  },
  {
    icon: Building2,
    title: "Location Managers",
    color: "bg-blue-50 text-blue-600",
    items: [
      "Post a detailed request for your property",
      "Specify machine types, traffic, and commission terms",
      "Receive applications from verified operators",
      "Review operator profiles, ratings, and reviews",
      "Accept the best match for your location",
      "Track everything from your dashboard",
    ],
  },
  {
    icon: UserPlus,
    title: "Requestors",
    color: "bg-emerald-50 text-emerald-600",
    items: [
      "Request a vending machine for any location you frequent",
      "Office break rooms, gyms, apartment lobbies — anywhere",
      "Operators see your request and respond",
      "Help bring vending to underserved locations",
      "No commitment required — just submit and wait",
      "Get notified when an operator is interested",
    ],
  },
];

const FAQ = [
  {
    q: "Is VendHub free to use?",
    a: "Yes! Posting requests and browsing operators is completely free. We plan to offer premium features for operators in the future.",
  },
  {
    q: "How does the matching process work?",
    a: "When you post a request, operators in your area can see it and apply. You'll receive their application with profile details, and you choose who to work with.",
  },
  {
    q: "Do I need to be a verified operator?",
    a: "No, but verified operators get a badge that helps build trust. Verification involves confirming your business details.",
  },
  {
    q: "What types of vending machines are supported?",
    a: "All types — snack, beverage, combo, healthy, coffee, frozen, fresh food, personal care, electronics, and custom/specialty machines.",
  },
  {
    q: "How do commissions work?",
    a: "Commission terms are negotiated directly between operators and location managers. Some locations offer commission; others don't. It's all transparent in the request details.",
  },
  {
    q: "Can I post multiple requests?",
    a: "Absolutely. Location managers and requestors can post as many requests as they need.",
  },
];

export default function HowItWorksPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-light-warm to-light py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl font-bold text-black-primary mb-4">
            How VendHub Works
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Whether you&apos;re looking for a vending machine or looking to place
            one, VendHub makes it simple.
          </p>
        </div>
      </section>

      {/* Steps */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={i} className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-4 relative">
                  <Icon className="w-7 h-7 text-green-primary" />
                  <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-green-primary text-white text-sm font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                </div>
                <h3 className="font-semibold text-black-primary mb-2">{step.title}</h3>
                <p className="text-sm text-slate-500">{step.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* For Each Role */}
      <section className="bg-white py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-black-primary text-center mb-12">
            Built for Every Role
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {ROLES.map((role) => {
              const Icon = role.icon;
              return (
                <div
                  key={role.title}
                  className="bg-light rounded-xl p-6 border border-slate-100"
                >
                  <div
                    className={`w-12 h-12 rounded-xl ${role.color} flex items-center justify-center mb-4`}
                  >
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-semibold text-black-primary text-lg mb-4">
                    {role.title}
                  </h3>
                  <ul className="space-y-2.5">
                    {role.items.map((item, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-slate-600"
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-black-primary text-center mb-8">
          Frequently Asked Questions
        </h2>
        <div className="space-y-3">
          {FAQ.map((item, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden"
            >
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between p-5 text-left"
              >
                <span className="font-medium text-black-primary">{item.q}</span>
                {openFaq === i ? (
                  <ChevronUp className="w-5 h-5 text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />
                )}
              </button>
              {openFaq === i && (
                <div className="px-5 pb-5 pt-0 text-sm text-slate-600 border-t border-slate-100 mt-0 pt-4">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-black-primary py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-slate-300 mb-8">
            Join hundreds of operators and locations already using VendHub.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/post-request"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-green-primary text-white rounded-xl font-semibold hover:bg-green-hover transition-colors"
            >
              Post a Request
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/browse-operators"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 border-2 border-white text-white rounded-xl font-semibold hover:bg-white hover:text-black-primary transition-colors"
            >
              Browse Operators
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
