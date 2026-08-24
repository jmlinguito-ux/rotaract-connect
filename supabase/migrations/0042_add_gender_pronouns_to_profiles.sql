-- Add gender/pronouns column to public.profiles for certificate generation and profile customization
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender TEXT;
