-- Multi-school structure. Existing installations are migrated into one school
-- and cafeteria so current accounts and records continue working.
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.cafeterias (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  name text not null check (length(trim(name)) between 2 and 160),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);

alter table public.profiles add column cafeteria_id uuid references public.cafeterias(id);
alter table public.profiles add column is_super_admin boolean not null default false;
alter table public.cash_registers add column cafeteria_id uuid references public.cafeterias(id);
alter table public.students add column cafeteria_id uuid references public.cafeterias(id);
alter table public.student_movements add column cafeteria_id uuid references public.cafeterias(id);
alter table public.sales add column cafeteria_id uuid references public.cafeterias(id);
alter table public.products add column cafeteria_id uuid references public.cafeterias(id);
alter table public.stock_movements add column cafeteria_id uuid references public.cafeterias(id);
alter table public.product_categories add column cafeteria_id uuid references public.cafeterias(id);

-- This backfill is a schema migration, not an authenticated inventory edit.
alter table public.product_categories disable trigger category_inventory_write_guard;

do $$
declare
  v_school uuid;
  v_cafeteria uuid;
begin
  select id into v_school from public.schools order by created_at limit 1;
  if v_school is null then
    insert into public.schools(name) values ('Colegio principal') returning id into v_school;
  end if;
  select id into v_cafeteria from public.cafeterias where school_id = v_school order by created_at limit 1;
  if v_cafeteria is null then
    insert into public.cafeterias(school_id, name) values (v_school, 'Cafetería principal') returning id into v_cafeteria;
  end if;
  update public.cash_registers set cafeteria_id = v_cafeteria where cafeteria_id is null;
  update public.profiles profile set cafeteria_id = register.cafeteria_id
    from public.cash_registers register where profile.cash_register_id = register.id and profile.cafeteria_id is null;
  update public.profiles set cafeteria_id = v_cafeteria where cafeteria_id is null;
  update public.students set cafeteria_id = v_cafeteria where cafeteria_id is null;
  update public.student_movements movement set cafeteria_id = register.cafeteria_id
    from public.cash_registers register where movement.cash_register_id = register.id and movement.cafeteria_id is null;
  update public.student_movements set cafeteria_id = v_cafeteria where cafeteria_id is null;
  update public.sales sale set cafeteria_id = register.cafeteria_id
    from public.cash_registers register where sale.cash_register_id = register.id and sale.cafeteria_id is null;
  update public.sales set cafeteria_id = v_cafeteria where cafeteria_id is null;
  update public.products set cafeteria_id = v_cafeteria where cafeteria_id is null;
  update public.stock_movements movement set cafeteria_id = product.cafeteria_id
    from public.products product where movement.product_id = product.id and movement.cafeteria_id is null;
  update public.stock_movements set cafeteria_id = v_cafeteria where cafeteria_id is null;
  update public.product_categories set cafeteria_id = v_cafeteria where cafeteria_id is null;
  update public.profiles set is_super_admin = true
    where user_id = (select user_id from public.profiles where role = 'administrator' and active order by created_at limit 1);
end $$;
alter table public.product_categories enable trigger category_inventory_write_guard;

alter table public.profiles alter column cafeteria_id set not null;
alter table public.cash_registers alter column cafeteria_id set not null;
alter table public.students alter column cafeteria_id set not null;
alter table public.student_movements alter column cafeteria_id set not null;
alter table public.sales alter column cafeteria_id set not null;
alter table public.products alter column cafeteria_id set not null;
alter table public.stock_movements alter column cafeteria_id set not null;
alter table public.product_categories alter column cafeteria_id set not null;

create index profiles_cafeteria_id_idx on public.profiles(cafeteria_id);
create index cash_registers_cafeteria_id_idx on public.cash_registers(cafeteria_id);
create index students_cafeteria_id_idx on public.students(cafeteria_id);
create index student_movements_cafeteria_id_idx on public.student_movements(cafeteria_id);
create index sales_cafeteria_id_idx on public.sales(cafeteria_id);
create index products_cafeteria_id_idx on public.products(cafeteria_id);
create index product_categories_cafeteria_id_idx on public.product_categories(cafeteria_id);

-- These identifiers must be unique inside a cafeteria, not across the network.
alter table public.cash_registers drop constraint if exists cash_registers_name_key;
create unique index cash_registers_cafeteria_name_idx on public.cash_registers(cafeteria_id, lower(name));
alter table public.students drop constraint if exists students_code_key;
create unique index students_cafeteria_code_idx on public.students(cafeteria_id, lower(code));
alter table public.product_categories drop constraint if exists product_categories_slug_key;
create unique index product_categories_cafeteria_slug_idx on public.product_categories(cafeteria_id, slug);
drop index if exists public.products_sku_unique_idx;
create unique index products_cafeteria_sku_unique_idx on public.products(cafeteria_id, lower(sku)) where sku is not null;

create or replace function private.current_cafeteria_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select cafeteria_id from public.profiles where user_id = (select auth.uid()) and active = true
$$;

create or replace function private.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where user_id = (select auth.uid()) and active and is_super_admin)
$$;

create or replace function private.can_access_cafeteria(p_cafeteria_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_super_admin() or (p_cafeteria_id is not null and p_cafeteria_id = private.current_cafeteria_id())
$$;

revoke all on function private.current_cafeteria_id() from public, anon;
revoke all on function private.is_super_admin() from public, anon;
revoke all on function private.can_access_cafeteria(uuid) from public, anon;
grant execute on function private.current_cafeteria_id() to authenticated;
grant execute on function private.is_super_admin() to authenticated;
grant execute on function private.can_access_cafeteria(uuid) to authenticated;

create or replace function private.apply_cafeteria_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_cafeteria uuid;
begin
  if tg_table_name = 'student_movements' and new.cash_register_id is not null then
    select cafeteria_id into v_cafeteria from public.cash_registers where id = new.cash_register_id;
  elsif tg_table_name = 'sales' and new.cash_register_id is not null then
    select cafeteria_id into v_cafeteria from public.cash_registers where id = new.cash_register_id;
  elsif tg_table_name = 'stock_movements' then
    select cafeteria_id into v_cafeteria from public.products where id = new.product_id;
  end if;
  if v_cafeteria is null then v_cafeteria := private.current_cafeteria_id(); end if;
  if not private.is_super_admin() and new.cafeteria_id is not null and new.cafeteria_id <> v_cafeteria then
    raise exception 'No puedes modificar datos de otra cafetería.';
  end if;
  new.cafeteria_id := coalesce(new.cafeteria_id, v_cafeteria);
  if new.cafeteria_id is null then raise exception 'cafeteria assignment required'; end if;
  return new;
end $$;
revoke all on function private.apply_cafeteria_scope() from public, anon, authenticated;

create trigger profile_cafeteria_guard before insert or update of cafeteria_id on public.profiles for each row execute function private.apply_cafeteria_scope();
create trigger register_cafeteria_guard before insert or update of cafeteria_id on public.cash_registers for each row execute function private.apply_cafeteria_scope();
create trigger student_cafeteria_guard before insert or update of cafeteria_id on public.students for each row execute function private.apply_cafeteria_scope();
create trigger movement_cafeteria_guard before insert or update of cafeteria_id on public.student_movements for each row execute function private.apply_cafeteria_scope();
create trigger sale_cafeteria_guard before insert or update of cafeteria_id on public.sales for each row execute function private.apply_cafeteria_scope();
create trigger product_cafeteria_guard before insert or update of cafeteria_id on public.products for each row execute function private.apply_cafeteria_scope();
create trigger stock_cafeteria_guard before insert or update of cafeteria_id on public.stock_movements for each row execute function private.apply_cafeteria_scope();
create trigger category_cafeteria_guard before insert or update of cafeteria_id on public.product_categories for each row execute function private.apply_cafeteria_scope();

create function private.protect_super_admin_flag()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not private.is_super_admin()
    and new.is_super_admin is distinct from old.is_super_admin then
    raise exception 'Solo un administrador superior puede cambiar ese nivel de acceso.';
  end if;
  return new;
end $$;
revoke all on function private.protect_super_admin_flag() from public, anon, authenticated;
create trigger protect_super_admin_flag before update of is_super_admin on public.profiles
for each row execute function private.protect_super_admin_flag();

alter table public.schools enable row level security;
alter table public.cafeterias enable row level security;
create policy school_network_select on public.schools for select to authenticated using (
  private.is_super_admin() or exists (select 1 from public.cafeterias cafe where cafe.school_id = schools.id and cafe.id = private.current_cafeteria_id())
);
create policy school_network_manage on public.schools for all to authenticated using (private.is_super_admin()) with check (private.is_super_admin());
create policy cafeteria_network_select on public.cafeterias for select to authenticated using (private.can_access_cafeteria(id));
create policy cafeteria_network_manage on public.cafeterias for all to authenticated using (private.is_super_admin()) with check (private.is_super_admin());
revoke all on public.schools, public.cafeterias from anon, authenticated;
grant select, insert, update on public.schools, public.cafeterias to authenticated;

-- Restrictive policies layer tenant ownership over the existing role and
-- operation policies, preventing otherwise permitted cross-cafeteria access.
create policy profiles_tenant_scope on public.profiles as restrictive for all to authenticated using (
  private.is_super_admin() or cafeteria_id = private.current_cafeteria_id()
) with check (private.is_super_admin() or cafeteria_id = private.current_cafeteria_id());
create policy registers_tenant_scope on public.cash_registers as restrictive for all to authenticated using (private.can_access_cafeteria(cafeteria_id)) with check (private.can_access_cafeteria(cafeteria_id));
create policy students_tenant_scope on public.students as restrictive for all to authenticated using (private.can_access_cafeteria(cafeteria_id)) with check (private.can_access_cafeteria(cafeteria_id));
create policy student_movements_tenant_scope on public.student_movements as restrictive for all to authenticated using (private.can_access_cafeteria(cafeteria_id)) with check (private.can_access_cafeteria(cafeteria_id));
create policy sales_tenant_scope on public.sales as restrictive for all to authenticated using (private.can_access_cafeteria(cafeteria_id)) with check (private.can_access_cafeteria(cafeteria_id));
create policy products_tenant_scope on public.products as restrictive for all to authenticated using (private.can_access_cafeteria(cafeteria_id)) with check (private.can_access_cafeteria(cafeteria_id));
create policy stock_tenant_scope on public.stock_movements as restrictive for all to authenticated using (private.can_access_cafeteria(cafeteria_id)) with check (private.can_access_cafeteria(cafeteria_id));
create policy categories_tenant_scope on public.product_categories as restrictive for all to authenticated using (private.can_access_cafeteria(cafeteria_id)) with check (private.can_access_cafeteria(cafeteria_id));
create policy sale_items_tenant_scope on public.sale_items as restrictive for all to authenticated using (
  exists (select 1 from public.sales sale where sale.id = sale_items.sale_id and private.can_access_cafeteria(sale.cafeteria_id))
) with check (
  exists (select 1 from public.sales sale where sale.id = sale_items.sale_id and private.can_access_cafeteria(sale.cafeteria_id))
);

create or replace function private.has_app_permission(p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles profile where profile.user_id = (select auth.uid()) and profile.active
    and case when profile.role = 'administrator' or profile.is_super_admin then true
      when profile.allowed_permissions is not null then p_permission = any(profile.allowed_permissions)
      when profile.role = 'cashier' then p_permission = any(array['admin:access','pos:access','pos:charge','cash-register:own','cash-register:close','student:read','student:abono','sales:read'])
      when profile.role = 'inventory' then p_permission = any(array['inventory:read','inventory:write','student:read']) else false end)
$$;

drop function if exists public.admin_save_cash_register(uuid, text, boolean, uuid);
create function public.admin_save_cash_register(p_id uuid, p_name text, p_active boolean, p_user_id uuid default null, p_cafeteria_id uuid default null)
returns public.cash_registers language plpgsql security definer set search_path = '' as $$
declare v_register public.cash_registers%rowtype; v_cafeteria uuid;
begin
  select cafeteria_id into v_cafeteria from public.profiles where user_id = (select auth.uid()) and active and role = 'administrator';
  if v_cafeteria is null and not private.is_super_admin() then raise exception 'operation not authorized'; end if;
  v_cafeteria := coalesce(p_cafeteria_id, v_cafeteria);
  if v_cafeteria is null or not private.can_access_cafeteria(v_cafeteria) then raise exception 'Selecciona una cafetería a la que tengas acceso.'; end if;
  if length(trim(p_name)) not between 1 and 80 then raise exception 'El nombre de la caja debe tener entre 1 y 80 caracteres.'; end if;
  if p_id is null then
    insert into public.cash_registers(name, active, cafeteria_id) values(trim(p_name), coalesce(p_active,true), v_cafeteria) returning * into v_register;
  else
    if not exists(select 1 from public.cash_registers where id=p_id and private.can_access_cafeteria(cafeteria_id)) then raise exception 'No tienes acceso a esa caja.'; end if;
    if not coalesce(p_active,true) and exists(select 1 from public.profiles where cash_register_id=p_id and active) then raise exception 'Reasigna los usuarios antes de desactivar esta caja.'; end if;
    update public.cash_registers set name=trim(p_name), active=coalesce(p_active,true) where id=p_id returning * into v_register;
    if not found then raise exception 'No se encontró la caja.'; end if;
  end if;
  if p_user_id is not null then
    if not v_register.active then raise exception 'No se puede asignar un usuario a una caja inactiva.'; end if;
    update public.profiles set cash_register_id=v_register.id, cafeteria_id=v_register.cafeteria_id where user_id=p_user_id and active
      and (private.is_super_admin() or cafeteria_id=v_register.cafeteria_id);
    if not found then raise exception 'El usuario elegido no está activo o pertenece a otro colegio.'; end if;
  end if;
  return v_register;
end $$;

revoke all on function public.admin_save_cash_register(uuid, text, boolean, uuid, uuid) from public, anon;
grant execute on function public.admin_save_cash_register(uuid, text, boolean, uuid, uuid) to authenticated;

grant select (cafeteria_id, is_super_admin) on public.profiles to authenticated;
