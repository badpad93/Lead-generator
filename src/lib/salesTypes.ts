export interface SalesLead {
  id: string;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: "new" | "contacted" | "qualified" | "unqualified" | "lost";
  assigned_to: string | null;
  account_id?: string | null;
  created_by?: string | null;
  source?: string | null;
  notes?: string | null;
  last_contacted_at?: string | null;
  next_followup_at?: string | null;
  created_at: string;
  updated_at?: string;
  // Joined
  assigned_profile?: { full_name: string | null; email: string | null } | null;
}

export type DealStage = "new" | "contacted" | "qualified" | "proposal" | "closing" | "won" | "lost";

export interface SalesDeal {
  id: string;
  lead_id: string | null;
  account_id: string | null;
  assigned_to: string | null;
  stage: DealStage;
  value: number;
  business_name: string;
  created_at: string;
  // Joined
  assigned_profile?: { full_name: string; email: string } | null;
  deal_services?: DealService[];
}

export interface DealService {
  id: string;
  deal_id: string;
  service_name: string;
  price: number;
  status: "pending" | "sold" | "fulfilled";
  created_at: string;
}

export interface SalesAccount {
  id: string;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes?: string | null;
  assigned_to?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface SalesOrder {
  id: string;
  deal_id: string | null;
  account_id: string | null;
  created_by: string | null;
  total_value: number;
  status: "draft" | "sent" | "completed";
  recipient_email: string | null;
  notes: string | null;
  created_at: string;
  // Joined
  sales_accounts?: SalesAccount | null;
  order_items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  service_name: string;
  price: number;
  notes: string | null;
  created_at: string;
}

export interface SalesDocument {
  id: string;
  account_id: string | null;
  order_id: string | null;
  file_url: string;
  type: "order_pdf" | "contract" | "receipt";
  file_name: string | null;
  created_at: string;
}

export const DEAL_STAGES: { value: DealStage; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "proposal", label: "Proposal" },
  { value: "closing", label: "Closing" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

export const SERVICE_OPTIONS = [
  "AI Vending Machines",
  "Location Services",
  "Website + Google Presence",
  "Financing",
  "Setup & Installation",
  "Licensing & Compliance",
  "White Glove Delivery",
  "Accounting & Bookkeeping",
  "Coffee Service",
  "Overhead Marketing Display",
] as const;
