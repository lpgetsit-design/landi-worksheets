
DROP POLICY "Granted users can view shared worksheets" ON public.worksheets;
DROP POLICY "Granted write users can update shared worksheets" ON public.worksheets;

CREATE POLICY "Granted users can view shared worksheets" ON public.worksheets FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.worksheet_access_grants WHERE worksheet_access_grants.worksheet_id = worksheets.id AND worksheet_access_grants.granted_to_user_id = auth.uid()));

CREATE POLICY "Granted write users can update shared worksheets" ON public.worksheets FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.worksheet_access_grants WHERE worksheet_access_grants.worksheet_id = worksheets.id AND worksheet_access_grants.granted_to_user_id = auth.uid() AND worksheet_access_grants.permission = 'write'::worksheet_permission));
