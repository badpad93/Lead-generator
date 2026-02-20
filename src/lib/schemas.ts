import { z } from "zod";

export const INDUSTRIES = [
  "Apartments",
  "Hotels",
  "Hospitals",
  "Assisted Living",
  "Nursing Homes",
  "Gyms",
  "Office Space",
  "School Campuses",
  "Warehouses",
  "Distribution Centers",
  "Manufacturing Plants",
  "Car Dealerships",
  "Car Service Stations",
  "Car Washes",
] as const;

export const createRunSchema = z.object({
  city: z.string().min(1, "City is required").max(100),
  state: z.string().min(2).max(2, "Use 2-letter state code"),
  radius: z.number().int().min(1).max(100).default(25),
  maxLeads: z.number().int().min(1).max(500).default(100),
  industries: z
    .array(z.string())
    .min(1, "Select at least one industry"),
});

export type CreateRunInput = z.infer<typeof createRunSchema>;

export const updateLeadSchema = z.object({
  notes: z.string().max(2000).optional(),
  contacted_date: z.string().nullable().optional(),
});
