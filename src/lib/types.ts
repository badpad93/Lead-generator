export type UserRole = "operator" | "location_manager" | "requestor";

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
export type MatchStatus = "pending" | "accepted" | "declined" | "installed";
export type MatchedBy = "platform" | "operator_applied" | "manual";
export type ContactPreference = "platform_message" | "email" | "phone";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  role: UserRole;
  company_name: string | null;
  phone: string | null;
  website: string | null;
  bio: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string;
  verified: boolean;
  rating: number;
  review_count: number;
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
  commission_offered: boolean;
  commission_notes: string | null;
  urgency: Urgency;
  status: RequestStatus;
  contact_preference: ContactPreference;
  is_public: boolean;
  views: number;
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

export interface Match {
  id: string;
  request_id: string;
  operator_id: string;
  matched_by: MatchedBy;
  status: MatchStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  vending_requests?: VendingRequest;
  profiles?: Profile;
}

export interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  match_id: string | null;
  subject: string | null;
  body: string;
  read: boolean;
  created_at: string;
  // Joined
  sender?: Profile;
  recipient?: Profile;
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

export interface SavedRequest {
  id: string;
  operator_id: string;
  request_id: string;
  created_at: string;
}

// Supabase Database type (simplified)
export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile> & { id: string }; Update: Partial<Profile> };
      vending_requests: { Row: VendingRequest; Insert: Omit<VendingRequest, "id" | "created_at" | "updated_at" | "views" | "profiles">; Update: Partial<VendingRequest> };
      operator_listings: { Row: OperatorListing; Insert: Omit<OperatorListing, "id" | "created_at" | "updated_at" | "views" | "profiles">; Update: Partial<OperatorListing> };
      matches: { Row: Match; Insert: Omit<Match, "id" | "created_at" | "updated_at">; Update: Partial<Match> };
      messages: { Row: Message; Insert: Omit<Message, "id" | "created_at" | "sender" | "recipient">; Update: Partial<Message> };
      reviews: { Row: Review; Insert: Omit<Review, "id" | "created_at" | "reviewer">; Update: Partial<Review> };
      saved_requests: { Row: SavedRequest; Insert: Omit<SavedRequest, "id" | "created_at">; Update: Partial<SavedRequest> };
    };
  };
}

// Constants
export const MACHINE_TYPES: { value: MachineType; label: string }[] = [
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
