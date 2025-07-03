/*
  # Fix missing teacher profiles and ratings

  1. Changes
    - Creates missing teacher_profiles for teachers
    - Creates missing teacher_ratings for teachers
    - Adds default values for new teacher profiles

  2. Security
    - Updates RLS policies for teacher_profiles
*/

-- Create missing teacher profiles
DO $$
DECLARE
  teacher_record RECORD;
BEGIN
  FOR teacher_record IN 
    SELECT p.id, p.full_name
    FROM profiles p
    LEFT JOIN teacher_profiles tp ON p.id = tp.id
    WHERE p.role = 'teacher'
    AND tp.id IS NULL
  LOOP
    INSERT INTO teacher_profiles (
      id,
      bio,
      experience_years,
      specialties,
      certifications,
      social_links,
      created_at,
      updated_at
    ) VALUES (
      teacher_record.id,
      teacher_record.full_name || ' is a yoga instructor passionate about helping students find balance and strength.',
      FLOOR(RANDOM() * 10) + 1,
      ARRAY['Hatha', 'Vinyasa'],
      ARRAY['200-Hour Yoga Alliance'],
      '{}'::jsonb,
      now(),
      now()
    );
    
    RAISE NOTICE 'Created teacher profile for %', teacher_record.full_name;
  END LOOP;
END;
$$;

-- Create missing teacher ratings
DO $$
DECLARE
  teacher_record RECORD;
BEGIN
  FOR teacher_record IN 
    SELECT p.id, p.full_name
    FROM profiles p
    LEFT JOIN teacher_ratings tr ON p.id = tr.teacher_id
    WHERE p.role = 'teacher'
    AND tr.teacher_id IS NULL
  LOOP
    INSERT INTO teacher_ratings (
      teacher_id,
      avg_rating,
      total_reviews,
      rating_counts,
      updated_at
    ) VALUES (
      teacher_record.id,
      5.0,
      0,
      '{"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}'::jsonb,
      now()
    );
    
    RAISE NOTICE 'Created teacher rating for %', teacher_record.full_name;
  END LOOP;
END;
$$;

-- Update RLS policies for teacher_profiles
ALTER TABLE IF EXISTS public.teacher_profiles ENABLE ROW LEVEL SECURITY;

-- RLS policies for teacher_profiles
DROP POLICY IF EXISTS "Anyone can view teacher profiles" ON public.teacher_profiles;
CREATE POLICY "Anyone can view teacher profiles" 
ON public.teacher_profiles
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Teachers can view and update own profile" ON public.teacher_profiles;
CREATE POLICY "Teachers can view and update own profile" 
ON public.teacher_profiles
FOR ALL
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Update teacher ratings based on reviews
DO $$
DECLARE
  teacher_record RECORD;
  avg_rating_val NUMERIC;
  total_reviews_val INTEGER;
  rating_counts_val JSONB;
BEGIN
  FOR teacher_record IN 
    SELECT DISTINCT teacher_id
    FROM teacher_reviews
  LOOP
    -- Calculate average rating and counts
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
      teacher_id = teacher_record.teacher_id;
    
    -- Update teacher_ratings
    UPDATE teacher_ratings
    SET 
      avg_rating = avg_rating_val,
      total_reviews = total_reviews_val,
      rating_counts = rating_counts_val,
      updated_at = now()
    WHERE 
      teacher_id = teacher_record.teacher_id;
      
    RAISE NOTICE 'Updated rating for teacher %: % stars from % reviews', 
      teacher_record.teacher_id, avg_rating_val, total_reviews_val;
  END LOOP;
END;
$$;