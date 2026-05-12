-- Expand sales_documents type CHECK to include location_agreement and esign types
ALTER TABLE public.sales_documents DROP CONSTRAINT IF EXISTS sales_documents_type_check;
ALTER TABLE public.sales_documents ADD CONSTRAINT sales_documents_type_check
  CHECK (type IN ('order_pdf', 'contract', 'receipt', 'location_agreement', 'esign'));
