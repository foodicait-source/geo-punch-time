-- keep only the admin role for the admin account
DELETE FROM public.user_roles ur
USING auth.users u
WHERE ur.user_id = u.id AND u.email = 'admin@admin.com' AND ur.role = 'employee';

-- Admins get full control over attendance records
CREATE POLICY "Admins manage attendance" ON public.attendance
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins get full control over profiles
CREATE POLICY "Admins manage profiles" ON public.profiles
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can assign / revoke roles
CREATE POLICY "Admins manage roles" ON public.user_roles
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));