-- ============================================================
-- RealJoy Attendance: security, geofencing, and the write path
-- Re-runnable. Paste into Supabase SQL Editor.
-- ============================================================

-- Link employees to Supabase Auth
alter table public.employees
  drop constraint if exists employees_auth_user_id_fkey;
alter table public.employees
  add constraint employees_auth_user_id_fkey
  foreign key (auth_user_id) references auth.users(id) on delete set null;

-- Private photo bucket
insert into storage.buckets (id, name, public)
values ('attendance-photos', 'attendance-photos', false)
on conflict (id) do nothing;

-- ---------- helpers ----------

create or replace function public.current_employee_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.employees
  where auth_user_id = auth.uid() and is_active = true
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.employees
    where auth_user_id = auth.uid() and role = 'ADMIN' and is_active = true
  );
$$;

create or replace function public.meters_between(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
) returns double precision language sql immutable as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    power(sin(radians(lon2 - lon1) / 2), 2)
  ));
$$;

-- ---------- row level security ----------

alter table public.employees          enable row level security;
alter table public.locations          enable row level security;
alter table public.attendance_records enable row level security;

drop policy if exists "employees_select" on public.employees;
create policy "employees_select" on public.employees
  for select to authenticated
  using (auth_user_id = auth.uid() or public.is_admin());

drop policy if exists "employees_admin_write" on public.employees;
create policy "employees_admin_write" on public.employees
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Staff never read locations: qr_secret must stay server-side only.
drop policy if exists "locations_admin_only" on public.locations;
create policy "locations_admin_only" on public.locations
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "records_select" on public.attendance_records;
create policy "records_select" on public.attendance_records
  for select to authenticated
  using (employee_id = public.current_employee_id() or public.is_admin());

-- Note: no INSERT policy for staff. Writes happen only via record_attendance().
drop policy if exists "records_admin_write" on public.attendance_records;
create policy "records_admin_write" on public.attendance_records
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- storage policies ----------

drop policy if exists "attendance_photo_insert" on storage.objects;
create policy "attendance_photo_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attendance-photos'
    and (storage.foldername(name))[1] = public.current_employee_id()::text
  );

drop policy if exists "attendance_photo_select" on storage.objects;
create policy "attendance_photo_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attendance-photos'
    and (
      (storage.foldername(name))[1] = public.current_employee_id()::text
      or public.is_admin()
    )
  );

-- ---------- the only write path ----------

create or replace function public.record_attendance(
  p_qr_secret  text,
  p_type       text,
  p_photo_path text,
  p_lat        double precision default null,
  p_lng        double precision default null,
  p_accuracy   double precision default null,
  p_device     jsonb            default null
) returns public.attendance_records
language plpgsql security definer set search_path = public as $$
declare
  v_emp       public.employees;
  v_loc       public.locations;
  v_now       timestamptz := now();
  v_local     timestamp   := now() at time zone 'Africa/Lagos';
  v_distance  double precision;
  v_status    text;
  v_record    public.attendance_records;
begin
  if p_type not in ('CHECK_IN', 'CHECK_OUT') then
    raise exception 'BAD_TYPE';
  end if;

  select * into v_emp
  from public.employees
  where auth_user_id = auth.uid() and is_active = true;
  if not found then
    raise exception 'NOT_AN_ACTIVE_EMPLOYEE';
  end if;

  select * into v_loc
  from public.locations
  where qr_secret = p_qr_secret and is_active = true;
  if not found then
    raise exception 'INVALID_QR';
  end if;

  if v_loc.latitude is not null and p_lat is not null then
    v_distance := public.meters_between(p_lat, p_lng, v_loc.latitude, v_loc.longitude);
    if v_distance > v_loc.radius_meters then
      raise exception 'OUT_OF_RANGE:%', round(v_distance::numeric);
    end if;
  end if;

  if p_type = 'CHECK_IN' and v_local::time > time '08:00' then
    v_status := 'LATE';
  else
    v_status := 'PRESENT';
  end if;

  begin
    insert into public.attendance_records (
      employee_id, location_id, type, scanned_at, work_date, photo_path,
      latitude, longitude, accuracy_m, distance_m, status, device_info
    ) values (
      v_emp.id, v_loc.id, p_type::"PunchType", v_now, v_local::date, p_photo_path,
      p_lat, p_lng, p_accuracy, v_distance, v_status::"AttendanceStatus", p_device
    ) returning * into v_record;
  exception when unique_violation then
    raise exception 'ALREADY_RECORDED';
  end;

  return v_record;
end; $$;

revoke all on function public.record_attendance(text, text, text, double precision, double precision, double precision, jsonb) from public, anon;
grant execute on function public.record_attendance(text, text, text, double precision, double precision, double precision, jsonb) to authenticated;