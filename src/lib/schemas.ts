import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  full_name: z.string().min(2, "Name is required"),
  role: z.enum(["operator", "location_manager", "requestor"]),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

export const createRequestSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(200),
  description: z.string().max(2000).optional(),
  location_name: z.string().min(2, "Location name is required").max(200),
  address: z.string().max(300).optional(),
  city: z.string().min(1, "City is required").max(100),
  state: z.string().min(2).max(2, "Use 2-letter state code"),
  zip: z.string().max(10).optional(),
  location_type: z.enum([
    "office", "gym", "apartment", "school", "hospital",
    "hotel", "warehouse", "retail", "government", "other",
  ]),
  machine_types_wanted: z.array(z.string()).min(1, "Select at least one machine type"),
  estimated_daily_traffic: z.number().int().min(0).max(100000).optional(),
  commission_offered: z.boolean().default(false),
  commission_notes: z.string().max(500).optional(),
  urgency: z.enum(["flexible", "within_1_month", "within_2_weeks", "asap"]).default("flexible"),
  contact_preference: z.enum(["platform_message", "email", "phone"]).default("platform_message"),
  is_public: z.boolean().default(true),
});

export const createListingSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(200),
  description: z.string().max(2000).optional(),
  machine_types: z.array(z.string()).min(1, "Select at least one machine type"),
  service_radius_miles: z.number().int().min(1).max(500).default(50),
  cities_served: z.array(z.string()).default([]),
  states_served: z.array(z.string()).min(1, "Select at least one state"),
  accepts_commission: z.boolean().default(true),
  min_daily_traffic: z.number().int().min(0).default(0),
  machine_count_available: z.number().int().min(1).max(1000).default(1),
});

export const createRouteSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(200),
  description: z.string().max(5000).optional(),
  city: z.string().min(1, "City is required").max(100),
  state: z.string().min(2).max(2, "Use 2-letter state code"),
  num_machines: z.number().int().min(1).max(10000),
  num_locations: z.number().int().min(1).max(10000),
  monthly_revenue: z.number().min(0).max(10000000).optional(),
  asking_price: z.number().min(0).max(100000000).optional(),
  machine_types: z.array(z.string()).min(1, "Select at least one machine type"),
  location_types: z.array(z.string()).default([]),
  includes_equipment: z.boolean().default(true),
  includes_contracts: z.boolean().default(true),
  contact_email: z.string().email().optional().or(z.literal("")),
  contact_phone: z.string().max(20).optional(),
  status: z.enum(["active", "sold", "pending"]).default("active"),
});

export const sendMessageSchema = z.object({
  recipient_id: z.string().uuid(),
  match_id: z.string().uuid().optional(),
  subject: z.string().max(200).optional(),
  body: z.string().min(1, "Message cannot be empty").max(5000),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type CreateListingInput = z.infer<typeof createListingSchema>;
export type CreateRouteInput = z.infer<typeof createRouteSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
