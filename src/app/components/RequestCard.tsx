"use client";

import Link from "next/link";
import type { VendingRequest } from "@/lib/types";
import {
  Heart,
  MapPin,
  Users,
  Clock,
  ArrowRight,
  HandCoins,
} from "lucide-react";
import MachineTypeBadge from "./MachineTypeBadge";
import UrgencyBadge from "./UrgencyBadge";
import LocationTypeIcon from "./LocationTypeIcon";

interface RequestCardProps {
  request: VendingRequest;
  saved?: boolean;
  onSave?: () => void;
}

function daysAgo(dateStr: string): string {
  const now = new Date();
  const created = new Date(dateStr);
  const diffMs = now.getTime() - created.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

export default function RequestCard({
  request,
  saved = false,
  onSave,
}: RequestCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 transition-shadow hover:shadow-lg hover:shadow-orange-primary/5 group">
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <LocationTypeIcon type={request.location_type} size="md" />
          <div className="min-w-0">
            <h3 className="font-semibold text-navy text-base leading-snug truncate">
              {request.title}
            </h3>
            <div className="flex items-center gap-1 mt-0.5 text-sm text-gray-500">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {request.city}, {request.state}
              </span>
            </div>
          </div>
        </div>

        {onSave && (
          <button
            type="button"
            onClick={onSave}
            className="shrink-0 p-1.5 rounded-lg hover:bg-peach transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-primary/50"
            aria-label={saved ? "Unsave request" : "Save request"}
          >
            <Heart
              className={`w-5 h-5 transition-colors ${
                saved
                  ? "fill-orange-primary text-orange-primary"
                  : "fill-none text-gray-400 hover:text-orange-primary"
              }`}
            />
          </button>
        )}
      </div>

      {/* Machine Types */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {request.machine_types_wanted.map((mt) => (
          <MachineTypeBadge key={mt} type={mt} size="sm" />
        ))}
      </div>

      {/* Details Row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 text-sm text-gray-600">
        {request.estimated_daily_traffic !== null && (
          <div className="flex items-center gap-1.5">
            <Users className="w-4 h-4 text-gray-400" />
            <span>
              <span className="font-medium text-navy">
                {request.estimated_daily_traffic.toLocaleString()}
              </span>{" "}
              daily traffic
            </span>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <HandCoins className="w-4 h-4 text-gray-400" />
          {request.commission_offered ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 ring-1 ring-inset ring-green-200">
              Commission Offered
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-gray-50 text-gray-500 ring-1 ring-inset ring-gray-200">
              No Commission
            </span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
        <div className="flex items-center gap-3">
          <UrgencyBadge urgency={request.urgency} />
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <Clock className="w-3 h-3" />
            {daysAgo(request.created_at)}
          </span>
        </div>

        <Link
          href={`/requests/${request.id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-orange-primary hover:text-orange-hover transition-colors group/link"
        >
          View Details
          <ArrowRight className="w-4 h-4 transition-transform group-hover/link:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
