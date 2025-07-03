/*
  # Fix teacher ratings and reviews

  1. Changes
    - Adds missing indexes for teacher_reviews and teacher_ratings tables
    - Adds trigger to update teacher ratings when reviews are added/updated/deleted
    - Fixes RLS policies for teacher_reviews and teacher_ratings tables
    - Adds function to check if a student can review a class

  2. Security
    - Enables RLS on all tables
    - Adds appropriate policies for each table
*/

-- Add missing indexes for teacher_reviews
CREATE INDEX IF NOT EXISTS idx_teacher_reviews_teacher_id ON public.teacher_reviews USING btree (teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_reviews_student_id ON public.teacher_reviews USING btree (student_id);
CREATE INDEX IF NOT EXISTS idx_teacher_reviews_class_id ON public.teacher_reviews USING btree (class_id);
CREATE INDEX IF NOT EXISTS idx_teacher_reviews_rating ON public.teacher_reviews USING btree (rating);

-- Add missing indexes for teacher_ratings
CREATE INDEX IF NOT EXISTS idx_teacher_ratings_avg_rating ON public.teacher_ratings USING btree (avg_rating);
CREATE INDEX IF NOT EXISTS idx_teacher_ratings_total_reviews ON public.teacher_ratings USING btree (total_reviews);

-- Create or replace function to update teacher rating
CREATE OR REPLACE FUNCTION update_teacher_rating()
RETURNS TRIGGER AS $$
DECLARE
  teacher_id_val UUID;
  avg_rating_val NUMERIC;
  total_reviews_val INTEGER;
  rating_counts_val JSONB;
BEGIN
  -- Determine the teacher_id based on the operation
  IF TG_OP = 'DELETE' THEN
    teacher_id_val := OLD.teacher_id;
  ELSE
    teacher_id_val := NEW.teacher_id;
  END IF;
  
  -- Calculate new average rating and counts
  SELECT 
    COALESCE(AVG(rating), 0) AS avg_rating,
    COUNT(*) AS total_reviews,
    jsonb_build_object(
      '1', COUNT(*) FILTER (WHERE rating = 1),
      '2', COUNT(*) FILTER (WHERE rating = 2),
      '3', COUNT(*) FILTER (WHERE rating = 3),
      '4', COUNT(*) FILTER (WHERE rating = 4),
      '5', COUNT(*) FILTER (WHERE rating = 5)
    ) AS rating_counts
  INTO 
    avg_rating_val, 
    total_reviews_val,
    rating_counts_val
  FROM 
    teacher_reviews
  WHERE 
    teacher_id = teacher_id_val;
  
  -- Insert or update the teacher_ratings record
  INSERT INTO teacher_ratings (
    teacher_id, 
    avg_rating, 
    total_reviews, 
    rating_counts,
    updated_at
  ) 
  VALUES (
    teacher_id_val, 
    avg_rating_val, 
    total_reviews_val, 
    rating_counts_val,
    now()
  )
  ON CONFLICT (teacher_id) 
  DO UPDATE SET 
    avg_rating = avg_rating_val,
    total_reviews = total_reviews_val,
    rating_counts = rating_counts_val,
    updated_at = now();
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Make sure the trigger exists
DROP TRIGGER IF EXISTS update_teacher_rating_on_review_change ON public.teacher_reviews;
CREATE TRIGGER update_teacher_rating_on_review_change
AFTER INSERT OR UPDATE OR DELETE ON public.teacher_reviews
FOR EACH ROW EXECUTE FUNCTION update_teacher_rating();

-- Function to check if a student can review a class
CREATE OR REPLACE FUNCTION can_student_review_class(
  p_student_id UUID,
  p_class_id UUID
)
RETURNS JSONB AS $$
DECLARE
  class_record RECORD;
  booking_record RECORD;
  existing_review RECORD;
  result JSONB;
BEGIN
  -- Check if class exists and is in the past
  SELECT * INTO class_record
  FROM yoga_classes
  WHERE id = p_class_id;
  
  IF class_record IS NULL THEN
    RETURN jsonb_build_object(
      'can_review', false,
      'reason', 'class_not_found',
      'message', 'Class not found'
    );
  END IF;
  
  -- Check if class is in the past
  IF (class_record.date || ' ' || class_record.time)::timestamp > now() THEN
    RETURN jsonb_build_object(
      'can_review', false,
      'reason', 'class_not_completed',
      'message', 'Cannot review a class that has not been completed yet'
    );
  END IF;
  
  -- Check if student has a confirmed booking with completed payment
  SELECT * INTO booking_record
  FROM bookings
  WHERE student_id = p_student_id
    AND class_id = p_class_id
    AND status = 'confirmed'
    AND payment_status = 'completed';
    
  IF booking_record IS NULL THEN
    RETURN jsonb_build_object(
      'can_review', false,
      'reason', 'no_booking',
      'message', 'You must have a confirmed booking with completed payment to review this class'
    );
  END IF;
  
  -- Check if student has already reviewed this class
  SELECT * INTO existing_review
  FROM teacher_reviews
  WHERE student_id = p_student_id
    AND class_id = p_class_id;
    
  IF existing_review IS NOT NULL THEN
    RETURN jsonb_build_object(
      'can_review', false,
      'reason', 'already_reviewed',
      'message', 'You have already reviewed this class'
    );
  END IF;
  
  -- All checks passed
  RETURN jsonb_build_object(
    'can_review', true,
    'teacher_id', class_record.teacher_id,
    'class_title', class_record.title
  );
END;
$$ LANGUAGE plpgsql;

-- Make sure RLS is enabled on teacher_reviews
ALTER TABLE IF EXISTS public.teacher_reviews ENABLE ROW LEVEL SECURITY;

-- RLS policies for teacher_reviews
DROP POLICY IF EXISTS "Anyone can view teacher reviews" ON public.teacher_reviews;
CREATE POLICY "Anyone can view teacher reviews" 
ON public.teacher_reviews
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Students can create and manage their reviews" ON public.teacher_reviews;
CREATE POLICY "Students can create and manage their reviews" 
ON public.teacher_reviews
FOR ALL
TO authenticated
USING (student_id = auth.uid())
WITH CHECK (student_id = auth.uid());

-- Make sure RLS is enabled on teacher_ratings
ALTER TABLE IF EXISTS public.teacher_ratings ENABLE ROW LEVEL SECURITY;

-- RLS policies for teacher_ratings
DROP POLICY IF EXISTS "Anyone can view teacher ratings" ON public.teacher_ratings;
CREATE POLICY "Anyone can view teacher ratings" 
ON public.teacher_ratings
FOR SELECT
TO authenticated
USING (true);

-- Ensure all teachers have a rating record
DO $$
DECLARE
  teacher_record RECORD;
BEGIN
  FOR teacher_record IN 
    SELECT p.id
    FROM profiles p
    LEFT JOIN teacher_ratings tr ON p.id = tr.teacher_id
    WHERE p.role = 'teacher'
    AND tr.teacher_id IS NULL
  LOOP
    INSERT INTO teacher_ratings (
      teacher_id,
      avg_rating,
      total_reviews,
      rating_counts
    ) VALUES (
      teacher_record.id,
      5.0,
      0,
      '{"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}'::jsonb
    );
  END LOOP;
END;
$$;