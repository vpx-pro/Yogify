/*
  # Fix Teacher Favorites and Reviews Functionality

  1. New Tables
    - Ensure proper relationships between saved_teachers and teacher_ratings tables
    - Fix foreign key constraints and unique constraints

  2. Security
    - Update RLS policies for proper access control
    - Ensure students can manage their saved teachers

  3. Fixes
    - Resolve foreign key relationship issues between tables
    - Fix duplicate key constraint violations in saved_teachers
*/

-- Fix saved_teachers table if it doesn't exist or has issues
CREATE TABLE IF NOT EXISTS saved_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(student_id, teacher_id)
);

-- Fix teacher_ratings table if it doesn't exist or has issues
CREATE TABLE IF NOT EXISTS teacher_ratings (
  teacher_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  avg_rating numeric(3,2) NOT NULL DEFAULT 0,
  total_reviews integer NOT NULL DEFAULT 0,
  rating_counts jsonb DEFAULT '{"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

-- Fix teacher_reviews table if it doesn't exist or has issues
CREATE TABLE IF NOT EXISTS teacher_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES yoga_classes(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(student_id, class_id)
);

-- Fix teacher_profiles table if it doesn't exist or has issues
CREATE TABLE IF NOT EXISTS teacher_profiles (
  id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  bio text,
  experience_years integer,
  specialties text[],
  certifications text[],
  social_links jsonb DEFAULT '{}'::jsonb,
  phone text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE saved_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_profiles ENABLE ROW LEVEL SECURITY;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_saved_teachers_student ON saved_teachers(student_id);
CREATE INDEX IF NOT EXISTS idx_saved_teachers_teacher ON saved_teachers(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_reviews_teacher ON teacher_reviews(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_reviews_student ON teacher_reviews(student_id);
CREATE INDEX IF NOT EXISTS idx_teacher_reviews_class ON teacher_reviews(class_id);
CREATE INDEX IF NOT EXISTS idx_teacher_reviews_rating ON teacher_reviews(rating);

-- Create RLS policies for saved_teachers
DROP POLICY IF EXISTS "Students can manage their saved teachers" ON saved_teachers;
CREATE POLICY "Students can manage their saved teachers"
  ON saved_teachers
  FOR ALL
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Create RLS policies for teacher_ratings
DROP POLICY IF EXISTS "Anyone can view teacher ratings" ON teacher_ratings;
CREATE POLICY "Anyone can view teacher ratings"
  ON teacher_ratings
  FOR SELECT
  TO authenticated
  USING (true);

-- Create RLS policies for teacher_reviews
DROP POLICY IF EXISTS "Students can create and manage their reviews" ON teacher_reviews;
CREATE POLICY "Students can create and manage their reviews"
  ON teacher_reviews
  FOR ALL
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Anyone can view teacher reviews" ON teacher_reviews;
CREATE POLICY "Anyone can view teacher reviews"
  ON teacher_reviews
  FOR SELECT
  TO authenticated
  USING (true);

-- Create RLS policies for teacher_profiles
DROP POLICY IF EXISTS "Teachers can view and update own profile" ON teacher_profiles;
CREATE POLICY "Teachers can view and update own profile"
  ON teacher_profiles
  FOR ALL
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Anyone can view teacher profiles" ON teacher_profiles;
CREATE POLICY "Anyone can view teacher profiles"
  ON teacher_profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Create function to update teacher ratings when reviews change
CREATE OR REPLACE FUNCTION update_teacher_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_avg_rating numeric(3,2);
  v_total_reviews integer;
  v_rating_counts jsonb;
BEGIN
  -- Calculate new average rating and counts
  SELECT 
    COALESCE(AVG(rating), 0)::numeric(3,2) as avg_rating,
    COUNT(*) as total_reviews,
    jsonb_build_object(
      '1', COUNT(*) FILTER (WHERE rating = 1),
      '2', COUNT(*) FILTER (WHERE rating = 2),
      '3', COUNT(*) FILTER (WHERE rating = 3),
      '4', COUNT(*) FILTER (WHERE rating = 4),
      '5', COUNT(*) FILTER (WHERE rating = 5)
    ) as rating_counts
  INTO 
    v_avg_rating, 
    v_total_reviews,
    v_rating_counts
  FROM teacher_reviews
  WHERE teacher_id = COALESCE(NEW.teacher_id, OLD.teacher_id);

  -- Insert or update the teacher_ratings record
  INSERT INTO teacher_ratings (
    teacher_id, 
    avg_rating, 
    total_reviews, 
    rating_counts,
    updated_at
  )
  VALUES (
    COALESCE(NEW.teacher_id, OLD.teacher_id),
    v_avg_rating,
    v_total_reviews,
    v_rating_counts,
    now()
  )
  ON CONFLICT (teacher_id) 
  DO UPDATE SET
    avg_rating = v_avg_rating,
    total_reviews = v_total_reviews,
    rating_counts = v_rating_counts,
    updated_at = now();

  RETURN NULL;
END;
$$;

-- Create triggers for teacher_reviews
DROP TRIGGER IF EXISTS update_teacher_rating_on_review_change ON teacher_reviews;
CREATE TRIGGER update_teacher_rating_on_review_change
  AFTER INSERT OR UPDATE OR DELETE ON teacher_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_teacher_rating();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create triggers for updated_at columns
DROP TRIGGER IF EXISTS update_teacher_profiles_updated_at ON teacher_profiles;
CREATE TRIGGER update_teacher_profiles_updated_at
  BEFORE UPDATE ON teacher_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_timestamp();

DROP TRIGGER IF EXISTS update_teacher_reviews_updated_at ON teacher_reviews;
CREATE TRIGGER update_teacher_reviews_updated_at
  BEFORE UPDATE ON teacher_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_timestamp();

-- Create function to check if a student can review a class
CREATE OR REPLACE FUNCTION can_student_review_class(
  p_student_id uuid,
  p_class_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking_exists boolean;
  v_class_completed boolean;
  v_review_exists boolean;
  v_teacher_id uuid;
BEGIN
  -- Check if student has a confirmed booking for this class
  SELECT EXISTS (
    SELECT 1 FROM bookings
    WHERE student_id = p_student_id
      AND class_id = p_class_id
      AND status = 'confirmed'
  ) INTO v_booking_exists;

  IF NOT v_booking_exists THEN
    RETURN jsonb_build_object(
      'can_review', false,
      'reason', 'no_booking',
      'message', 'You must book and attend this class before reviewing'
    );
  END IF;

  -- Check if class is in the past (completed)
  SELECT EXISTS (
    SELECT 1 FROM yoga_classes
    WHERE id = p_class_id
      AND (date || ' ' || time)::timestamp < now()
  ) INTO v_class_completed;

  IF NOT v_class_completed THEN
    RETURN jsonb_build_object(
      'can_review', false,
      'reason', 'class_not_completed',
      'message', 'You can only review classes you have completed'
    );
  END IF;

  -- Check if student already reviewed this class
  SELECT EXISTS (
    SELECT 1 FROM teacher_reviews
    WHERE student_id = p_student_id
      AND class_id = p_class_id
  ) INTO v_review_exists;

  IF v_review_exists THEN
    RETURN jsonb_build_object(
      'can_review', false,
      'reason', 'already_reviewed',
      'message', 'You have already reviewed this class'
    );
  END IF;

  -- Get teacher ID for the class
  SELECT teacher_id INTO v_teacher_id
  FROM yoga_classes
  WHERE id = p_class_id;

  -- All checks passed
  RETURN jsonb_build_object(
    'can_review', true,
    'teacher_id', v_teacher_id
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION can_student_review_class(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION update_teacher_rating() TO authenticated;
GRANT EXECUTE ON FUNCTION update_updated_at_timestamp() TO authenticated;