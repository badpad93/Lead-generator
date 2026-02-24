import type { LocationType } from "@/lib/types";
import {
  Building2,
  Home,
  Dumbbell,
  GraduationCap,
  Heart,
  BedDouble,
  Warehouse,
  ShoppingBag,
  Landmark,
  MapPin,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const iconMap: Record<LocationType, LucideIcon> = {
  office: Building2,
  apartment: Home,
  gym: Dumbbell,
  school: GraduationCap,
  hospital: Heart,
  hotel: BedDouble,
  warehouse: Warehouse,
  retail: ShoppingBag,
  government: Landmark,
  other: MapPin,
};

const sizeMap = {
  sm: { box: "w-8 h-8", icon: "w-4 h-4" },
  md: { box: "w-10 h-10", icon: "w-5 h-5" },
  lg: { box: "w-12 h-12", icon: "w-6 h-6" },
} as const;

interface LocationTypeIconProps {
  type: string;
  size?: "sm" | "md" | "lg";
}

export default function LocationTypeIcon({
  type,
  size = "md",
}: LocationTypeIconProps) {
  const key = type as LocationType;
  const Icon = iconMap[key] ?? MapPin;
  const dimensions = sizeMap[size];

  return (
    <div
      className={`${dimensions.box} flex items-center justify-center rounded-lg bg-orange-50 text-orange-primary shrink-0`}
    >
      <Icon className={dimensions.icon} />
    </div>
  );
}
