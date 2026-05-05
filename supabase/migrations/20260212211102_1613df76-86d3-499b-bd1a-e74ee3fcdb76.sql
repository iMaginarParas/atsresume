-- Add defensive checks to handle_new_user SECURITY DEFINER function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate that we're only creating profile for the new user
  IF NEW.id IS NULL THEN
    RAISE EXCEPTION 'Invalid user ID';
  END IF;
  
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.handle_new_user() IS 'SECURITY DEFINER required to insert into profiles table from auth trigger. Only processes NEW.id from the triggering auth.users insert. Do not modify without security review.';