/*
  # Enhanced Class Features

  1. New Columns
    - Add `meeting_link` to yoga_classes for online classes
    - Add `image_url` to yoga_classes for class images
    - Add indexes for better performance

  2. Updates
    - Update RLS policies to handle new fields
    - Add constraints for data validation

  3. Performance
    - Add indexes for common queries
*/

-- Add new columns to yoga_classes table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yoga_classes' AND column_name = 'meeting_link'
  ) THEN
    ALTER TABLE yoga_classes ADD COLUMN meeting_link text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yoga_classes' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE yoga_classes ADD COLUMN image_url text;
  END IF;
END $$;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_yoga_classes_date_time ON yoga_classes(date, time);
CREATE INDEX IF NOT EXISTS idx_yoga_classes_teacher_id ON yoga_classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_bookings_student_class ON bookings(student_id, class_id);
CREATE INDEX IF NOT EXISTS idx_bookings_class_status ON bookings(class_id, status);

-- Add constraint to ensure meeting_link is provided for online classes
-- Note: This is a soft constraint handled in the application logic
-- as we can't easily determine if a class is "online" from the database alone

-- Update the profiles table to ensure better data integrity
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'profiles_email_check'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_email_check 
    CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
  END IF;
END $$;

-- Add check constraint for price to ensure it's not negative
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'yoga_classes_price_check'
  ) THEN
    ALTER TABLE yoga_classes ADD CONSTRAINT yoga_classes_price_check 
    CHECK (price >= 0 AND price <= 999);
  END IF;
END $$;

-- Add check constraint for participants
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'yoga_classes_participants_check'
  ) THEN
    ALTER TABLE yoga_classes ADD CONSTRAINT yoga_classes_participants_check 
    CHECK (current_participants >= 0 AND current_participants <= max_participants AND max_participants > 0);
  END IF;
END $$;

-- Add check constraint for duration
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'yoga_classes_duration_check'
  ) THEN
    ALTER TABLE yoga_classes ADD CONSTRAINT yoga_classes_duration_check 
    CHECK (duration >= 15 AND duration <= 180);
  END IF;
END $$;