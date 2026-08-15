-- Allow sign-in with username or email.
-- Resolves a username to its account email so the client can call
-- signInWithPassword (which requires an email). SECURITY DEFINER because the
-- profiles table blocks unauthenticated reads; returns only the email for an
-- exact, case-insensitive username match.
CREATE OR REPLACE FUNCTION email_for_username(p_username TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT email FROM profiles WHERE lower(username) = lower(p_username) LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION email_for_username(TEXT) TO anon, authenticated;
