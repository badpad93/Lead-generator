import type { MachineType } from "@/lib/types";

const colorMap: Record<
  MachineType,
  { bg: string; text: string; ring: string }
> = {
  snack: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    ring: "ring-amber-200",
  },
  beverage: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    ring: "ring-blue-200",
  },
  combo: {
    bg: "bg-purple-50",
    text: "text-purple-700",
    ring: "ring-purple-200",
  },
  healthy: {
    bg: "bg-green-50",
    text: "text-green-700",
    ring: "ring-green-200",
  },
  coffee: {
    bg: "bg-green-50",
    text: "text-orange-800",
    ring: "ring-green-200",
  },
  frozen: {
    bg: "bg-cyan-50",
    text: "text-cyan-700",
    ring: "ring-cyan-200",
  },
  fresh_food: {
    bg: "bg-lime-50",
    text: "text-lime-700",
    ring: "ring-lime-200",
  },
  personal_care: {
    bg: "bg-pink-50",
    text: "text-pink-700",
    ring: "ring-pink-200",
  },
  electronics: {
    bg: "bg-slate-50",
    text: "text-slate-700",
    ring: "ring-slate-200",
  },
  custom: {
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    ring: "ring-indigo-200",
  },
};

const labelMap: Record<MachineType, string> = {
  snack: "Snack",
  beverage: "Beverage",
  combo: "Combo",
  healthy: "Healthy",
  coffee: "Coffee",
  frozen: "Frozen",
  fresh_food: "Fresh Food",
  personal_care: "Personal Care",
  electronics: "Electronics",
  custom: "Custom",
};

interface MachineTypeBadgeProps {
  type: string;
  size?: "sm" | "md";
}

export default function MachineTypeBadge({
  type,
  size = "sm",
}: MachineTypeBadgeProps) {
  const key = type as MachineType;
  const colors = colorMap[key] ?? {
    bg: "bg-gray-50",
    text: "text-gray-700",
    ring: "ring-gray-200",
  };
  const label = labelMap[key] ?? type;

  const sizeClasses =
    size === "sm"
      ? "px-2 py-0.5 text-xs"
      : "px-2.5 py-1 text-sm";

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full ring-1 ring-inset ${colors.bg} ${colors.text} ${colors.ring} ${sizeClasses}`}
    >
      {label}
    </span>
  );
}
