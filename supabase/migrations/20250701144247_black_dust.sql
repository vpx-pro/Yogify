/*
  # Add Retreat Features to Yogify

  1. New Columns for yoga_classes table
    - `is_retreat` (boolean) - Identifies if this is a retreat
    - `retreat_end_date` (date) - End date for multi-day retreats
    - `retreat_image_url` (text) - Banner image for retreats
    - `retreat_highlights` (text[]) - Array of retreat highlights
    - `retreat_capacity` (integer) - Specific capacity for retreats
    - `is_virtual` (boolean) - Whether retreat is virtual or physical
    - `early_bird_price` (decimal) - Early bird pricing
    - `early_bird_deadline` (date) - Early bird deadline

  2. Indexes
    - Add indexes for retreat filtering and queries

  3. Constraints
    - Ensure retreat-specific validations
*/

-- Add retreat-specific columns to yoga_classes table
DO $$
BEGIN
  -- Add is_retreat column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yoga_classes' AND column_name = 'is_retreat'
  ) THEN
    ALTER TABLE yoga_classes ADD COLUMN is_retreat boolean NOT NULL DEFAULT false;
  END IF;

  -- Add retreat_end_date column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yoga_classes' AND column_name = 'retreat_end_date'
  ) THEN
    ALTER TABLE yoga_classes ADD COLUMN retreat_end_date date;
  END IF;

  -- Add retreat_image_url column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yoga_classes' AND column_name = 'retreat_image_url'
  ) THEN
    ALTER TABLE yoga_classes ADD COLUMN retreat_image_url text;
  END IF;

  -- Add retreat_highlights column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yoga_classes' AND column_name = 'retreat_highlights'
  ) THEN
    ALTER TABLE yoga_classes ADD COLUMN retreat_highlights text[];
  END IF;

  -- Add retreat_capacity column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yoga_classes' AND column_name = 'retreat_capacity'
  ) THEN
    ALTER TABLE yoga_classes ADD COLUMN retreat_capacity integer;
  END IF;

  -- Add is_virtual column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yoga_classes' AND column_name = 'is_virtual'
  ) THEN
    ALTER TABLE yoga_classes ADD COLUMN is_virtual boolean NOT NULL DEFAULT false;
  END IF;

  -- Add early_bird_price column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yoga_classes' AND column_name = 'early_bird_price'
  ) THEN
    ALTER TABLE yoga_classes ADD COLUMN early_bird_price decimal(10,2);
  END IF;

  -- Add early_bird_deadline column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yoga_classes' AND column_name = 'early_bird_deadline'
  ) THEN
    ALTER TABLE yoga_classes ADD COLUMN early_bird_deadline date;
  END IF;
END $$;

-- Add indexes for retreat filtering
CREATE INDEX IF NOT EXISTS idx_yoga_classes_is_retreat ON yoga_classes(is_retreat);
CREATE INDEX IF NOT EXISTS idx_yoga_classes_is_virtual ON yoga_classes(is_virtual);
CREATE INDEX IF NOT EXISTS idx_yoga_classes_retreat_dates ON yoga_classes(date, retreat_end_date) WHERE is_retreat = true;
CREATE INDEX IF NOT EXISTS idx_yoga_classes_early_bird ON yoga_classes(early_bird_deadline) WHERE early_bird_deadline IS NOT NULL;

-- Add constraints for retreat data integrity
DO $$
BEGIN
  -- Ensure retreat end date is after start date
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'yoga_classes_retreat_date_check'
  ) THEN
    ALTER TABLE yoga_classes ADD CONSTRAINT yoga_classes_retreat_date_check 
    CHECK (
      (is_retreat = false) OR 
      (is_retreat = true AND retreat_end_date IS NOT NULL AND retreat_end_date >= date)
    );
  END IF;

  -- Ensure retreat capacity is set for retreats
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'yoga_classes_retreat_capacity_check'
  ) THEN
    ALTER TABLE yoga_classes ADD CONSTRAINT yoga_classes_retreat_capacity_check 
    CHECK (
      (is_retreat = false) OR 
      (is_retreat = true AND retreat_capacity IS NOT NULL AND retreat_capacity BETWEEN 5 AND 50)
    );
  END IF;

  -- Ensure early bird price is less than regular price
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'yoga_classes_early_bird_price_check'
  ) THEN
    ALTER TABLE yoga_classes ADD CONSTRAINT yoga_classes_early_bird_price_check 
    CHECK (
      (early_bird_price IS NULL) OR 
      (early_bird_price > 0 AND early_bird_price < price)
    );
  END IF;

  -- Ensure early bird deadline is before retreat start date
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'yoga_classes_early_bird_deadline_check'
  ) THEN
    ALTER TABLE yoga_classes ADD CONSTRAINT yoga_classes_early_bird_deadline_check 
    CHECK (
      (early_bird_deadline IS NULL) OR 
      (early_bird_deadline < date)
    );
  END IF;
END $$;

-- Function to get retreat duration in days
CREATE OR REPLACE FUNCTION get_retreat_duration(
  p_start_date date,
  p_end_date date
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_end_date IS NULL THEN
    RETURN 1;
  END IF;
  
  RETURN (p_end_date - p_start_date) + 1;
END;
$$;

-- Function to check if early bird pricing is active
CREATE OR REPLACE FUNCTION is_early_bird_active(
  p_early_bird_deadline date
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_early_bird_deadline IS NULL THEN
    RETURN false;
  END IF;
  
  RETURN p_early_bird_deadline >= CURRENT_DATE;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_retreat_duration(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION is_early_bird_active(date) TO authenticated;

-- Update existing classes to have proper retreat defaults
UPDATE yoga_classes 
SET 
  is_retreat = false,
  is_virtual = CASE WHEN location = 'Online' THEN true ELSE false END
WHERE is_retreat IS NULL OR is_virtual IS NULL;