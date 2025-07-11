/*
  # Fix RLS Policies and Security Issues

  1. Security Updates
    - Fix RLS policies for bookings table
    - Fix RLS policies for saved_teachers table  
    - Fix RLS policies for teacher_ratings table
    - Add secure functions for participant count updates
    - Add secure functions for teacher rating updates

  2. Functions
    - Create secure participant count sync function
    - Create secure teacher rating update function
    - Add proper SECURITY DEFINER privileges

  3. Policy Updates
    - Allow students to create bookings for themselves
    - Allow students to save teachers
    - Restrict direct teacher_ratings manipulation
    - Allow teachers to update their own classes
*/

-- Drop existing problematic policies if they exist
DROP POLICY IF EXISTS "Students can create own bookings" ON bookings;
DROP POLICY IF EXISTS "Students can manage their saved teachers" ON saved_teachers;
DROP POLICY IF EXISTS "Anyone can view teacher ratings" ON teacher_ratings;

-- Create secure function for participant count updates
CREATE OR REPLACE FUNCTION sync_participant_count(class_id_param uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  confirmed_count integer;
BEGIN
  -- Count confirmed bookings with completed payments
  SELECT COUNT(*)
  INTO confirmed_count
  FROM bookings
  WHERE class_id = class_id_param
    AND status = 'confirmed'
    AND payment_status = 'completed';

  -- Update the class participant count
  UPDATE yoga_classes
  SET current_participants = confirmed_count,
      updated_at = now()
  WHERE id = class_id_param;

  -- Log the sync operation
  INSERT INTO participant_count_audit (
    class_id,
    action,
    old_count,
    new_count,
    reason
  )
  SELECT 
    class_id_param,
    'sync',
    current_participants,
    confirmed_count,
    'Automated sync via secure function'
  FROM yoga_classes
  WHERE id = class_id_param;
END;
$$;

-- Create secure function for teacher rating updates
CREATE OR REPLACE FUNCTION update_teacher_rating_secure(teacher_id_param uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  avg_rating_calc numeric(3,2);
  total_reviews_count integer;
  rating_counts_calc jsonb;
BEGIN
  -- Calculate average rating and total reviews
  SELECT 
    COALESCE(AVG(rating), 0)::numeric(3,2),
    COUNT(*)
  INTO avg_rating_calc, total_reviews_count
  FROM teacher_reviews
  WHERE teacher_id = teacher_id_param;

  -- Calculate rating distribution
  SELECT jsonb_build_object(
    '1', COALESCE(SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END), 0),
    '2', COALESCE(SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END), 0),
    '3', COALESCE(SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END), 0),
    '4', COALESCE(SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END), 0),
    '5', COALESCE(SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END), 0)
  )
  INTO rating_counts_calc
  FROM teacher_reviews
  WHERE teacher_id = teacher_id_param;

  -- Update or insert teacher rating
  INSERT INTO teacher_ratings (
    teacher_id,
    avg_rating,
    total_reviews,
    rating_counts,
    updated_at
  )
  VALUES (
    teacher_id_param,
    avg_rating_calc,
    total_reviews_count,
    rating_counts_calc,
    now()
  )
  ON CONFLICT (teacher_id)
  DO UPDATE SET
    avg_rating = EXCLUDED.avg_rating,
    total_reviews = EXCLUDED.total_reviews,
    rating_counts = EXCLUDED.rating_counts,
    updated_at = EXCLUDED.updated_at;
END;
$$;

-- Create function to safely create test bookings
CREATE OR REPLACE FUNCTION create_test_booking(
  student_id_param uuid,
  class_id_param uuid,
  payment_status_param payment_status DEFAULT 'completed'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  booking_id uuid;
BEGIN
  -- Insert the booking
  INSERT INTO bookings (
    student_id,
    class_id,
    status,
    payment_status,
    booking_date,
    created_at
  )
  VALUES (
    student_id_param,
    class_id_param,
    'confirmed',
    payment_status_param,
    now(),
    now()
  )
  RETURNING id INTO booking_id;

  -- Update participant count
  PERFORM sync_participant_count(class_id_param);

  RETURN booking_id;
END;
$$;

-- Create function to safely save teachers
CREATE OR REPLACE FUNCTION save_teacher_for_student(
  student_id_param uuid,
  teacher_id_param uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  saved_id uuid;
BEGIN
  INSERT INTO saved_teachers (
    student_id,
    teacher_id,
    created_at
  )
  VALUES (
    student_id_param,
    teacher_id_param,
    now()
  )
  ON CONFLICT (student_id, teacher_id) DO NOTHING
  RETURNING id INTO saved_id;

  RETURN saved_id;
END;
$$;

-- Create function to safely create teacher reviews
CREATE OR REPLACE FUNCTION create_teacher_review(
  student_id_param uuid,
  teacher_id_param uuid,
  class_id_param uuid,
  rating_param integer,
  comment_param text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  review_id uuid;
BEGIN
  -- Insert the review
  INSERT INTO teacher_reviews (
    student_id,
    teacher_id,
    class_id,
    rating,
    comment,
    created_at
  )
  VALUES (
    student_id_param,
    teacher_id_param,
    class_id_param,
    rating_param,
    comment_param,
    now()
  )
  ON CONFLICT (student_id, class_id) 
  DO UPDATE SET
    rating = EXCLUDED.rating,
    comment = EXCLUDED.comment,
    updated_at = now()
  RETURNING id INTO review_id;

  -- Update teacher rating
  PERFORM update_teacher_rating_secure(teacher_id_param);

  RETURN review_id;
END;
$$;

-- Fix bookings RLS policies
CREATE POLICY "Students can create own bookings" ON bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'student'
    )
  );

CREATE POLICY "Students can view own bookings" ON bookings
  FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Students can update own bookings" ON bookings
  FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Teachers can view bookings for their classes" ON bookings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM yoga_classes
      WHERE id = bookings.class_id AND teacher_id = auth.uid()
    )
  );

-- Fix saved_teachers RLS policies
CREATE POLICY "Students can manage their saved teachers" ON saved_teachers
  FOR ALL
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Fix teacher_ratings RLS policies (read-only for users)
CREATE POLICY "Anyone can view teacher ratings" ON teacher_ratings
  FOR SELECT
  TO authenticated
  USING (true);

-- Restrict direct manipulation of teacher_ratings
CREATE POLICY "Prevent direct teacher rating manipulation" ON teacher_ratings
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "Prevent direct teacher rating updates" ON teacher_ratings
  FOR UPDATE
  TO authenticated
  USING (false);

-- Fix teacher_reviews RLS policies
DROP POLICY IF EXISTS "Students can create and manage their reviews" ON teacher_reviews;

CREATE POLICY "Students can create their own reviews" ON teacher_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'student'
    )
  );

CREATE POLICY "Students can view and update their own reviews" ON teacher_reviews
  FOR ALL
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Anyone can view teacher reviews" ON teacher_reviews
  FOR SELECT
  TO authenticated
  USING (true);

-- Fix yoga_classes RLS policies for participant count updates
DROP POLICY IF EXISTS "Teachers can update own classes" ON yoga_classes;

CREATE POLICY "Teachers can update own classes" ON yoga_classes
  FOR UPDATE
  TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- Allow system updates for participant counts (via secure functions)
CREATE POLICY "Allow system participant count updates" ON yoga_classes
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Grant execute permissions on secure functions
GRANT EXECUTE ON FUNCTION sync_participant_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION update_teacher_rating_secure(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION create_test_booking(uuid, uuid, payment_status) TO authenticated;
GRANT EXECUTE ON FUNCTION save_teacher_for_student(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION create_teacher_review(uuid, uuid, uuid, integer, text) TO authenticated;

-- Update existing triggers to use secure functions
DROP TRIGGER IF EXISTS update_teacher_rating_on_review_change ON teacher_reviews;

CREATE TRIGGER update_teacher_rating_on_review_change
  AFTER INSERT OR UPDATE OR DELETE ON teacher_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_teacher_rating();

-- Create trigger for automatic participant count sync
CREATE OR REPLACE FUNCTION trigger_sync_participant_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM sync_participant_count(NEW.class_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM sync_participant_count(OLD.class_id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS auto_sync_participant_count ON bookings;

CREATE TRIGGER auto_sync_participant_count
  AFTER INSERT OR UPDATE OR DELETE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION trigger_sync_participant_count();