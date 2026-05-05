export type UserRole = "operator" | "location_manager" | "admin" | "sales" | "director_of_sales" | "market_leader";

export type LocationType =
  | "office"
  | "gym"
  | "apartment"
  | "school"
  | "hospital"
  | "hotel"
  | "warehouse"
  | "retail"
  | "government"
  | "other";

export type MachineType =
  | "ai"
  | "snack"
  | "beverage"
  | "combo"
  | "healthy"
  | "coffee"
  | "frozen"
  | "fresh_food"
  | "personal_care"
  | "electronics"
  | "custom";

export type Urgency = "flexible" | "within_1_month" | "within_2_weeks" | "asap";
export type RequestStatus = "open" | "matched" | "closed";
export type OperatorStatus = "available" | "limited" | "full";

export type ContactPreference = "platform_message" | "email" | "phone";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  company_name: string | null;
  phone: string | null;
  website: string | null;
  bio: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string;
  verified: boolean;
  rating: number;
  review_count: number;
  featured: boolean;
  digest_opt_in: boolean;
  digest_frequency: "daily" | "weekly" | "never";
  digest_last_sent_at: string | null;
  created_at: string;
}

export interface VendingRequest {
  id: string;
  created_by: string;
  title: string;
  description: string | null;
  location_name: string;
  address: string | null;
  city: string;
  state: string;
  zip: string | null;
  location_type: LocationType;
  machine_types_wanted: MachineType[];
  estimated_daily_traffic: number | null;
  price: number | null;
  commission_offered: boolean;
  commission_notes: string | null;
  urgency: Urgency;
  status: RequestStatus;
  contact_phone: string | null;
  contact_email: string | null;
  decision_maker_name: string | null;
  contact_preference: ContactPreference;
  is_public: boolean;
  views: number;
  seller_name: string | null;
  lead_type: "standard" | "contracted";
  created_at: string;
  updated_at: string;
  // Joined
  profiles?: Profile;
}

export interface OperatorListing {
  id: string;
  operator_id: string;
  title: string;
  description: string | null;
  machine_types: MachineType[];
  service_radius_miles: number;
  cities_served: string[];
  states_served: string[];
  accepts_commission: boolean;
  min_daily_traffic: number;
  machine_count_available: number;
  status: OperatorStatus;
  featured: boolean;
  views: number;
  created_at: string;
  updated_at: string;
  // Joined
  profiles?: Profile;
}

export interface Review {
  id: string;
  reviewer_id: string;
  reviewee_id: string;
  match_id: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
  // Joined
  reviewer?: Profile;
}

export interface RouteListing {
  id: string;
  created_by: string;
  title: string;
  description: string | null;
  city: string;
  state: string;
  num_machines: number;
  num_locations: number;
  monthly_revenue: number | null;
  asking_price: number | null;
  machine_types: MachineType[];
  location_types: LocationType[];
  includes_equipment: boolean;
  includes_contracts: boolean;
  contact_email: string | null;
  contact_phone: string | null;
  status: "active" | "sold" | "pending";
  created_at: string;
  updated_at: string;
  // Joined
  profiles?: Profile;
}

export type MachineListingCondition = "new" | "like_new" | "good" | "fair" | "for_parts";
export type MachineListingStatus = "pending" | "active" | "sold" | "rejected";

export interface MachineListing {
  id: string;
  created_by: string;
  title: string;
  description: string | null;
  city: string;
  state: string;
  machine_make: string | null;
  machine_model: string | null;
  machine_year: number | null;
  machine_type: string | null;
  condition: MachineListingCondition | null;
  quantity: number;
  asking_price: number | null;
  includes_card_reader: boolean;
  includes_install: boolean;
  includes_delivery: boolean;
  photos: string[];
  /** Optimized primary image — thumbnail (300w WebP). May be null for legacy listings. */
  image_thumb_url: string | null;
  /** Optimized primary image — medium (800w WebP). May be null for legacy listings. */
  image_medium_url: string | null;
  /** Optimized primary image — main display (1200w WebP). May be null for legacy listings. */
  image_main_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: MachineListingStatus;
  admin_notes: string | null;
  buy_now_enabled: boolean;
  buy_now_price: number | null;
  delivery_fee_cents: number | null;
  created_at: string;
  updated_at: string;
  // Joined
  profiles?: Profile;
}

export interface TimeEntry {
  id: string;
  user_id: string;
  role: string | null;
  clock_in: string;
  clock_out: string | null;
  duration_minutes: number | null;
  total_hours: number | null;
  notes: string | null;
  admin_edited: boolean;
  edited_by: string | null;
  created_at: string;
  updated_at: string;
  profiles?: Pick<Profile, "id" | "full_name" | "role">;
}

export interface SignedAgreement {
  id: string;
  user_id: string;
  user_email: string;
  lead_id: string | null;
  purchase_id: string | null;
  agreement_version: string;
  agreement_text: string;
  accepted_terms: boolean;
  accepted_population_clause: boolean;
  accepted_esign: boolean;
  full_name: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  // Joined
  vending_requests?: Pick<VendingRequest, "id" | "title" | "location_name" | "city" | "state"> | null;
  lead_purchases?: Pick<PurchasedLeadRow, "id" | "amount_cents" | "stripe_checkout_session_id"> | null;
}

export interface PurchasedLeadRow {
  id: string;
  user_id: string;
  request_id: string;
  stripe_checkout_session_id: string;
  stripe_payment_intent_id: string | null;
  amount_cents: number;
  currency: string;
  buyer_email: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

// Supabase Database type (simplified)
export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile> & { id: string }; Update: Partial<Profile> };
      vending_requests: { Row: VendingRequest; Insert: Omit<VendingRequest, "id" | "created_at" | "updated_at" | "views" | "profiles">; Update: Partial<VendingRequest> };
      operator_listings: { Row: OperatorListing; Insert: Omit<OperatorListing, "id" | "created_at" | "updated_at" | "views" | "profiles">; Update: Partial<OperatorListing> };
      reviews: { Row: Review; Insert: Omit<Review, "id" | "created_at" | "reviewer">; Update: Partial<Review> };
    };
  };
}

// Constants
export const MACHINE_TYPES: { value: MachineType; label: string }[] = [
  { value: "ai", label: "AI Vending Machine" },
  { value: "snack", label: "Snack" },
  { value: "beverage", label: "Beverage / Soda" },
  { value: "combo", label: "Combo (Snack + Drink)" },
  { value: "healthy", label: "Healthy / Organic" },
  { value: "coffee", label: "Coffee / Hot Drinks" },
  { value: "frozen", label: "Frozen / Ice Cream" },
  { value: "fresh_food", label: "Fresh Food / Meals" },
  { value: "personal_care", label: "Personal Care / PPE" },
  { value: "electronics", label: "Electronics / Accessories" },
  { value: "custom", label: "Custom / Specialty" },
];

export const LOCATION_TYPES: { value: LocationType; label: string }[] = [
  { value: "office", label: "Office / Corporate" },
  { value: "apartment", label: "Apartment / Residential" },
  { value: "gym", label: "Gym / Fitness Center" },
  { value: "school", label: "School / University" },
  { value: "hospital", label: "Hospital / Medical" },
  { value: "hotel", label: "Hotel / Hospitality" },
  { value: "warehouse", label: "Warehouse / Industrial" },
  { value: "retail", label: "Retail / Shopping" },
  { value: "government", label: "Government / Public" },
  { value: "other", label: "Other" },
];

export const URGENCY_OPTIONS: { value: Urgency; label: string }[] = [
  { value: "flexible", label: "Flexible" },
  { value: "within_1_month", label: "Within 1 Month" },
  { value: "within_2_weeks", label: "Within 2 Weeks" },
  { value: "asap", label: "ASAP" },
];

export const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV",
  "NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
  "TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

export const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};
