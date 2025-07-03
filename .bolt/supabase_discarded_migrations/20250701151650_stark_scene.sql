/*
  # Retreat Features Migration

  1. New Columns Added to yoga_classes
    - `is_retreat` (boolean) - Distinguishes retreats from regular classes
    - `retreat_end_date` (date) - End date for multi-day retreats
    - `retreat_image_url` (text) - Banner image URL for retreats
    - `retreat_highlights` (text[]) - Array of retreat highlights
    - `retreat_capacity` (integer) - Retreat-specific participant capacity
    - `is_virtual` (boolean) - Virtual vs physical retreat/class
    - `early_bird_price` (numeric) - Early bird pricing
    - `early_bird_deadline` (date) - Early bird deadline

  2. Constraints Added
    - Retreat end date must be after start date
    - Retreat capacity must be between 5-50 participants
    - Early bird price must be positive and less than regular price
    - Early bird deadline must be before retreat start date

  3. Indexes Added
    - Performance indexes for retreat filtering
    - Optimized queries for virtual classes and early bird pricing

  4. Helper Functions
    - Duration calculation for retreats
    - Early bird pricing validation
    - Current price calculation
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
DO $$
BEGIN
  -- Add retreat end date constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'retreat_end_date_check' 
    AND table_name = 'yoga_classes'
  ) THEN
    ALTER TABLE yoga_classes 
    ADD CONSTRAINT retreat_end_date_check 
    CHECK (
      (is_retreat = false) OR 
      (is_retreat = true AND retreat_end_date IS NOT NULL AND retreat_end_date >= date)
    );
  END IF;

  -- Add retreat capacity constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'retreat_capacity_check' 
    AND table_name = 'yoga_classes'
  ) THEN
    ALTER TABLE yoga_classes 
    ADD CONSTRAINT retreat_capacity_check 
    CHECK (
      (is_retreat = false) OR 
      (is_retreat = true AND retreat_capacity IS NOT NULL AND retreat_capacity >= 5 AND retreat_capacity <= 50)
    );
  END IF;

  -- Add early bird price constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'early_bird_price_check' 
    AND table_name = 'yoga_classes'
  ) THEN
    ALTER TABLE yoga_classes 
    ADD CONSTRAINT early_bird_price_check 
    CHECK (
      early_bird_price IS NULL OR 
      (early_bird_price > 0 AND early_bird_price < price)
    );
  END IF;

  -- Add early bird deadline constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'early_bird_deadline_check' 
    AND table_name = 'yoga_classes'
  ) THEN
    ALTER TABLE yoga_classes 
    ADD CONSTRAINT early_bird_deadline_check 
    CHECK (
      early_bird_deadline IS NULL OR 
      early_bird_deadline < date
    );
  END IF;
END $$;

-- Add indexes for retreat filtering
CREATE INDEX IF NOT EXISTS idx_yoga_classes_is_retreat 
ON yoga_classes (is_retreat);

CREATE INDEX IF NOT EXISTS idx_yoga_classes_retreat_dates 
ON yoga_classes (date, retreat_end_date) 
WHERE is_retreat = true;

CREATE INDEX IF NOT EXISTS idx_yoga_classes_is_virtual 
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

-- Drop existing functions if they exist to avoid conflicts
DROP FUNCTION IF EXISTS get_retreat_duration(date, date);
DROP FUNCTION IF EXISTS is_early_bird_active(date);
DROP FUNCTION IF EXISTS get_current_price(numeric, numeric, date);

-- Add helpful function to get retreat duration
CREATE OR REPLACE FUNCTION get_retreat_duration(
  start_date date, 
  end_date date
)
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
CREATE OR REPLACE FUNCTION is_early_bird_active(
  early_bird_deadline date
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT early_bird_deadline IS NOT NULL AND early_bird_deadline >= CURRENT_DATE;
$$;

-- Add function to get current price (early bird or regular)
CREATE OR REPLACE FUNCTION get_current_price(
  regular_price numeric, 
  early_bird_price numeric, 
  early_bird_deadline date
)
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

-- Add function to validate retreat data
CREATE OR REPLACE FUNCTION validate_retreat_data()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- If it's a retreat, ensure required fields are set
  IF NEW.is_retreat = true THEN
    IF NEW.retreat_end_date IS NULL THEN
      RAISE EXCEPTION 'Retreat end date is required for retreats';
    END IF;
    
    IF NEW.retreat_capacity IS NULL THEN
      RAISE EXCEPTION 'Retreat capacity is required for retreats';
    END IF;
    
    -- Use retreat capacity for max_participants if not explicitly set
    IF NEW.max_participants < NEW.retreat_capacity THEN
      NEW.max_participants = NEW.retreat_capacity;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Add trigger for retreat validation
DROP TRIGGER IF EXISTS validate_retreat_trigger ON yoga_classes;
CREATE TRIGGER validate_retreat_trigger
  BEFORE INSERT OR UPDATE ON yoga_classes
  FOR EACH ROW
  EXECUTE FUNCTION validate_retreat_data();