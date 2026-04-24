-- Migration 038: Link deals and pipeline items bidirectionally
-- When a deal is created it gets added to a pipeline, and vice versa.

ALTER TABLE pipeline_items ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES sales_deals(id) ON DELETE SET NULL;
ALTER TABLE sales_deals ADD COLUMN IF NOT EXISTS pipeline_item_id UUID REFERENCES pipeline_items(id) ON DELETE SET NULL;
ALTER TABLE sales_deals ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_items_deal ON pipeline_items(deal_id);
CREATE INDEX IF NOT EXISTS idx_sales_deals_pipeline_item ON sales_deals(pipeline_item_id);
CREATE INDEX IF NOT EXISTS idx_sales_deals_pipeline ON sales_deals(pipeline_id);
