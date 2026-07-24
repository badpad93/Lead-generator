-- Optional referring-sales-rep field captured at signup.
--
-- Free-text name of the sales rep that told the client about us. Not a
-- FK to profiles — customers rarely know a rep's system id or exact
-- spelling, and mismatching against a lookup would drop useful data.
-- Reporting can join by fuzzy match against sales role profiles later.
--
-- Additive column, nullable, safe on live data.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS referring_sales_rep_name text;
