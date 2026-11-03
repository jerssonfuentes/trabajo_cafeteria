insert into public.cash_registers (name, active)
values ('Caja principal', true)
on conflict (name) do update set active = true;

update public.profiles
set cash_register_id = (select id from public.cash_registers where name = 'Caja principal')
where cash_register_id is null;

alter table public.profiles
  add constraint profiles_require_cash_register check (cash_register_id is not null);

create or replace function private.has_app_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles profile
    where profile.user_id = (select auth.uid()) and profile.active = true
      and case
        when profile.role = 'administrator' then true
        when profile.allowed_permissions is not null then p_permission = any(profile.allowed_permissions)
        when profile.role = 'cashier' then p_permission = any(array[
          'admin:access', 'pos:access', 'pos:charge', 'cash-register:own', 'cash-register:close',
          'student:read', 'student:abono', 'sales:read'
        ])
        when profile.role = 'inventory' then p_permission = any(array['inventory:read', 'inventory:write', 'student:read'])
        else false
      end
  )
$$;

revoke all on function private.has_app_permission(text) from public, anon;
grant execute on function private.has_app_permission(text) to authenticated;

-- Existing customized cashier permission lists also receive the new close view.
update public.profiles
set allowed_permissions = array(
  select distinct permission
  from unnest(allowed_permissions || array['admin:access', 'cash-register:close', 'student:read']) permission
  order by permission
)
where role = 'cashier'
  and allowed_permissions is not null
  and 'cash-register:own' = any(allowed_permissions)
  and 'sales:read' = any(allowed_permissions);

create or replace function public.admin_save_cash_register(
  p_id uuid,
  p_name text,
  p_active boolean,
  p_user_id uuid default null
)
returns public.cash_registers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_register public.cash_registers%rowtype;
begin
  if not exists (
    select 1 from public.profiles
    where user_id = (select auth.uid()) and active = true and role = 'administrator'
  ) then raise exception 'operation not authorized'; end if;
  if length(trim(p_name)) not between 1 and 80 then
    raise exception 'El nombre de la caja debe tener entre 1 y 80 caracteres.';
  end if;

  if p_id is null then
    insert into public.cash_registers (name, active)
    values (trim(p_name), coalesce(p_active, true))
    returning * into v_register;
  else
    if not coalesce(p_active, true) and exists (
      select 1 from public.profiles where cash_register_id = p_id and active = true
    ) then
      raise exception 'Reasigna los usuarios antes de desactivar esta caja.';
    end if;
    update public.cash_registers
    set name = trim(p_name), active = coalesce(p_active, true)
    where id = p_id returning * into v_register;
    if not found then raise exception 'No se encontró la caja.'; end if;
  end if;

  if p_user_id is not null then
    if not v_register.active then raise exception 'No se puede asignar un usuario a una caja inactiva.'; end if;
    update public.profiles set cash_register_id = v_register.id
    where user_id = p_user_id and active = true;
    if not found then raise exception 'El usuario elegido no está activo.'; end if;
  end if;

  return v_register;
end;
$$;

revoke all on function public.admin_save_cash_register(uuid, text, boolean, uuid) from public, anon;
grant execute on function public.admin_save_cash_register(uuid, text, boolean, uuid) to authenticated;
