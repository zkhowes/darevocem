-- Seed common_items and saved_phrases for Dare Vocem
-- Run AFTER the first user signs in.
-- Auto-detects the first user in auth.users.

-- To run: npx supabase db execute --file supabase/seed.sql

DO $$
DECLARE
  target_id uuid;
BEGIN
  -- Get the first (and likely only) user
  SELECT id INTO target_id FROM auth.users LIMIT 1;

  IF target_id IS NULL THEN
    RAISE EXCEPTION 'No users found. A user must sign in first.';
  END IF;

  -- === Dates ===
  INSERT INTO common_items (user_id, label, value, category, is_dynamic, sort_order) VALUES
    (target_id, 'Today', '[Today]', 'Dates', true, 1),
    (target_id, 'Yesterday', '[Yesterday]', 'Dates', true, 2),
    (target_id, 'Tomorrow', '[Tomorrow]', 'Dates', true, 3),
    (target_id, 'Monday', 'Monday', 'Dates', false, 4),
    (target_id, 'Tuesday', 'Tuesday', 'Dates', false, 5),
    (target_id, 'Wednesday', 'Wednesday', 'Dates', false, 6),
    (target_id, 'Thursday', 'Thursday', 'Dates', false, 7),
    (target_id, 'Friday', 'Friday', 'Dates', false, 8),
    (target_id, 'Saturday', 'Saturday', 'Dates', false, 9),
    (target_id, 'Sunday', 'Sunday', 'Dates', false, 10);

  -- === Names ===
  INSERT INTO common_items (user_id, label, value, category, sort_order) VALUES
    (target_id, 'Mom', 'Mom', 'Names', 1),
    (target_id, 'Dad', 'Dad', 'Names', 2),
    (target_id, 'Doctor', 'my doctor', 'Names', 3),
    (target_id, 'Nurse', 'the nurse', 'Names', 4);

  -- === Medications ===
  INSERT INTO common_items (user_id, label, value, category, sort_order) VALUES
    (target_id, 'Pain medicine', 'pain medicine', 'Medications', 1),
    (target_id, 'Anti-nausea', 'anti-nausea medication', 'Medications', 2),
    (target_id, 'Steroids', 'steroids', 'Medications', 3),
    (target_id, 'Seizure meds', 'seizure medication', 'Medications', 4),
    (target_id, 'Vitamins', 'vitamins', 'Medications', 5);

  -- === Places ===
  INSERT INTO common_items (user_id, label, value, category, sort_order) VALUES
    (target_id, 'Home', 'home', 'Places', 1),
    (target_id, 'Hospital', 'the hospital', 'Places', 2),
    (target_id, 'Bathroom', 'the bathroom', 'Places', 3),
    (target_id, 'Kitchen', 'the kitchen', 'Places', 4),
    (target_id, 'Bedroom', 'the bedroom', 'Places', 5),
    (target_id, 'Outside', 'outside', 'Places', 6);

  -- === Saved Phrases ===
  INSERT INTO saved_phrases (user_id, text, category, sort_order) VALUES
    -- Introductions
    (target_id, 'I have trouble speaking but I can understand you', 'Introductions', 1),
    (target_id, 'Please give me a moment to respond', 'Introductions', 2),
    -- Daily
    (target_id, 'Good morning', 'Daily', 1),
    (target_id, 'Thank you', 'Daily', 2),
    (target_id, 'Yes please', 'Daily', 3),
    (target_id, 'No thank you', 'Daily', 4),
    (target_id, 'I love you', 'Daily', 5),
    -- Medical
    (target_id, 'I am in pain', 'Medical', 1),
    (target_id, 'I feel nauseous', 'Medical', 2),
    (target_id, 'I need my medication', 'Medical', 3),
    (target_id, 'I need to use the bathroom', 'Medical', 4),
    (target_id, 'I am feeling better today', 'Medical', 5),
    -- Social
    (target_id, 'How are you doing', 'Social', 1),
    (target_id, 'I missed you', 'Social', 2),
    (target_id, 'Tell me about your day', 'Social', 3),
    (target_id, 'That makes me happy', 'Social', 4);

  RAISE NOTICE 'Seeded % common_items and 16 saved_phrases for user %',
    (SELECT count(*) FROM common_items WHERE user_id = target_id), target_id;
END $$;
