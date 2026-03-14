-- Break RLS recursion with security-definer helpers
CREATE OR REPLACE FUNCTION public.is_worksheet_owner(_worksheet_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.worksheets w
    WHERE w.id = _worksheet_id
      AND w.user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.has_worksheet_access(
  _worksheet_id uuid,
  _user_id uuid,
  _required_permission public.worksheet_permission DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.worksheet_access_grants g
    WHERE g.worksheet_id = _worksheet_id
      AND g.granted_to_user_id = _user_id
      AND (_required_permission IS NULL OR g.permission = _required_permission)
  );
$$;

-- Rebuild worksheet_access_grants policies (remove recursive ALL policy)
DROP POLICY IF EXISTS "Owners can manage access grants" ON public.worksheet_access_grants;

CREATE POLICY "Owners can view access grants"
ON public.worksheet_access_grants
FOR SELECT
TO authenticated
USING (public.is_worksheet_owner(worksheet_id, auth.uid()));

CREATE POLICY "Owners can insert access grants"
ON public.worksheet_access_grants
FOR INSERT
TO authenticated
WITH CHECK (public.is_worksheet_owner(worksheet_id, auth.uid()));

CREATE POLICY "Owners can update access grants"
ON public.worksheet_access_grants
FOR UPDATE
TO authenticated
USING (public.is_worksheet_owner(worksheet_id, auth.uid()))
WITH CHECK (public.is_worksheet_owner(worksheet_id, auth.uid()));

CREATE POLICY "Owners can delete access grants"
ON public.worksheet_access_grants
FOR DELETE
TO authenticated
USING (public.is_worksheet_owner(worksheet_id, auth.uid()));

-- Rebuild shared worksheet policies to use helper function
DROP POLICY IF EXISTS "Granted users can view shared worksheets" ON public.worksheets;
DROP POLICY IF EXISTS "Granted write users can update shared worksheets" ON public.worksheets;

CREATE POLICY "Granted users can view shared worksheets"
ON public.worksheets
FOR SELECT
TO authenticated
USING (public.has_worksheet_access(id, auth.uid(), NULL));

CREATE POLICY "Granted write users can update shared worksheets"
ON public.worksheets
FOR UPDATE
TO authenticated
USING (public.has_worksheet_access(id, auth.uid(), 'write'::public.worksheet_permission));

-- Optional hardening for versions table (ownership check via helper)
DROP POLICY IF EXISTS "Users can view versions of own worksheets" ON public.worksheet_versions;
DROP POLICY IF EXISTS "Users can create versions of own worksheets" ON public.worksheet_versions;

CREATE POLICY "Users can view versions of own worksheets"
ON public.worksheet_versions
FOR SELECT
TO authenticated
USING (public.is_worksheet_owner(worksheet_id, auth.uid()));

CREATE POLICY "Users can create versions of own worksheets"
ON public.worksheet_versions
FOR INSERT
TO authenticated
WITH CHECK (public.is_worksheet_owner(worksheet_id, auth.uid()));