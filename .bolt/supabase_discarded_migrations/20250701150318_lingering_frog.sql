/*
  # Add Retreat Features to Yoga Classes

  1. New Columns for Retreats
    - `is_retreat` (boolean) - Identifies if this is a retreat vs regular class
    - `retreat_end_date` (date) - End date for multi-day retreats
    - `retreat_image_url` (text) - Banner image for retreats
    - `retreat_highlights` (text[]) - Array of retreat highlights
    - `retreat_capacity` (integer) - Retreat-specific capacity
    - `is_virtual` (boolean) - Virtual vs physical retreat
    - `early_bird_price` (numeric) - Early bird pricing
    - `early_bird_deadline` (date) - Early bird deadline

  2. Security
    - Maintain existing RLS policies
    - Add validation constraints for retreat-specific fields

  3. Indexes
    - Add indexes for retreat filtering and performance
*/

-- Add retreat-specific columns to yoga_classes table
ALTER TABLE yoga_classes 
ADD COLUMN IF NOT EXISTS is_retreat boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS retreat_end_date date,
ADD COLUMN IF NOT EXISTS retreat_image_url text,
ADD COLUMN IF NOT EXISTS retreat_highlights text[],
ADD COLUMN IF NOT EXISTS retreat_capacity integer,
ADD COLUMN IF NOT EXISTS is_virtual boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS early_bird_price numeric(10,2),
ADD COLUMN IF NOT EXISTS early_bird_deadline date;

-- Add constraints for retreat fields
ALTER TABLE yoga_classes 
ADD CONSTRAINT retreat_end_date_check 
CHECK (
  (is_retreat = false) OR 
  (is_retreat = true AND retreat_end_date >= date)
);

ALTER TABLE yoga_classes 
ADD CONSTRAINT retreat_capacity_check 
CHECK (
  (is_retreat = false) OR 
  (is_retreat = true AND retreat_capacity >= 5 AND retreat_capacity <= 50)
);

ALTER TABLE yoga_classes 
ADD CONSTRAINT early_bird_price_check 
CHECK (
  early_bird_price IS NULL OR 
  (early_bird_price > 0 AND early_bird_price < price)
);

ALTER TABLE yoga_classes 
ADD CONSTRAINT early_bird_deadline_check 
CHECK (
  early_bird_deadline IS NULL OR 
  early_bird_deadline < date
);

-- Add indexes for retreat filtering
CREATE INDEX IF NOT EXISTS idx_yoga_classes_is_retreat 
ON yoga_classes (is_retreat);

CREATE INDEX IF NOT EXISTS idx_yoga_classes_retreat_dates 
ON yoga_classes (date, retreat_end_date) 
WHERE is_retreat = true;

CREATE INDEX IF NOT EXISTS idx_yoga_classes_virtual 
ON yoga_classes (is_virtual);

CREATE INDEX IF NOT EXISTS idx_yoga_classes_early_bird 
ON yoga_classes (early_bird_deadline) 
WHERE early_bird_deadline IS NOT NULL;

-- Update existing classes to have default retreat values
UPDATE yoga_classes 
SET 
  is_retreat = false,
  is_virtual = CASE 
    WHEN location ILIKE '%online%' OR location ILIKE '%virtual%' THEN true 
    ELSE false 
  END
WHERE is_retreat IS NULL;

-- Add helpful function to get retreat duration
CREATE OR REPLACE FUNCTION get_retreat_duration(start_date date, end_date date)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE 
    WHEN end_date IS NULL THEN 1
    ELSE EXTRACT(days FROM end_date - start_date)::integer + 1
  END;
$$;

-- Add function to check if early bird pricing is active
CREATE OR REPLACE FUNCTION is_early_bird_active(early_bird_deadline date)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT early_bird_deadline IS NOT NULL AND early_bird_deadline >= CURRENT_DATE;
$$;

-- Add function to get current price (early bird or regular)
CREATE OR REPLACE FUNCTION get_current_price(regular_price numeric, early_bird_price numeric, early_bird_deadline date)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT CASE 
    WHEN is_early_bird_active(early_bird_deadline) AND early_bird_price IS NOT NULL 
    THEN early_bird_price
    ELSE regular_price
  END;
$$;