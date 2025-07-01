/*
  # Fix retreat duration constraint and creation logic

  1. Database Changes
    - Update duration constraint to allow longer durations for retreats
    - Fix retreat creation logic to handle duration properly
    - Update validation functions

  2. Security
    - Maintain existing RLS policies
    - Keep constraint validations for regular classes
*/

-- Update the duration constraint to allow longer durations for retreats
ALTER TABLE yoga_classes DROP CONSTRAINT IF EXISTS yoga_classes_duration_check;

-- Add new duration constraint that handles both classes and retreats
ALTER TABLE yoga_classes 
ADD CONSTRAINT yoga_classes_duration_check 
CHECK (
  (is_retreat = false AND duration >= 15 AND duration <= 180) OR
  (is_retreat = true AND duration >= 60 AND duration <= 10080)  -- Up to 7 days in minutes
);

-- Update the validate_retreat_data function to handle duration properly
CREATE OR REPLACE FUNCTION validate_retreat_data()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- If it's a retreat, ensure required fields are set and calculate proper duration
  IF NEW.is_retreat = true THEN
    IF NEW.retreat_end_date IS NULL THEN
      RAISE EXCEPTION 'Retreat end date is required for retreats';
    END IF;
    
    IF NEW.retreat_capacity IS NULL THEN
      RAISE EXCEPTION 'Retreat capacity is required for retreats';
    END IF;
    
    -- Calculate duration in minutes for retreats (days * 24 * 60)
    -- But store a reasonable duration value (e.g., daily session duration)
    IF NEW.duration > 10080 THEN  -- More than 7 days in minutes
      -- Set to a reasonable daily session duration for retreats
      NEW.duration = 120;  -- 2 hours daily session
    END IF;
    
    -- Use retreat capacity for max_participants if not explicitly set
    IF NEW.max_participants < NEW.retreat_capacity THEN
      NEW.max_participants = NEW.retreat_capacity;
    END IF;
  ELSE
    -- For regular classes, ensure duration is within normal limits
    IF NEW.duration < 15 OR NEW.duration > 180 THEN
      RAISE EXCEPTION 'Class duration must be between 15 and 180 minutes';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;