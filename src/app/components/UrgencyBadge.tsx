import type { Urgency } from "@/lib/types";
import { Clock, AlertTriangle, Zap, CalendarClock } from "lucide-react";

const configMap: Record<
  Urgency,
  { bg: string; text: string; ring: string; icon: React.ElementType; label: string }
> = {
  flexible: {
    bg: "bg-slate-50",
    text: "text-slate-600",
    ring: "ring-slate-200",
    icon: CalendarClock,
    label: "Flexible",
  },
  within_1_month: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    ring: "ring-amber-200",
    icon: Clock,
    label: "Within 1 Month",
  },
  within_2_weeks: {
    bg: "bg-green-50",
    text: "text-green-primary",
    ring: "ring-green-200",
    icon: AlertTriangle,
    label: "Within 2 Weeks",
  },
  asap: {
    bg: "bg-red-50",
    text: "text-red-700",
    ring: "ring-red-200",
    icon: Zap,
    label: "ASAP",
  },
};

interface UrgencyBadgeProps {
  urgency: string;
}

export default function UrgencyBadge({ urgency }: UrgencyBadgeProps) {
  const key = urgency as Urgency;
  const config = configMap[key] ?? {
    bg: "bg-gray-50",
    text: "text-gray-600",
    ring: "ring-gray-200",
    icon: Clock,
    label: urgency,
  };

  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full ring-1 ring-inset ${config.bg} ${config.text} ${config.ring}`}
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}
