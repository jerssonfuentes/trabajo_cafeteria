alter table public.profiles
  add column if not exists allowed_permissions text[];

create or replace function private.has_app_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.user_id = (select auth.uid())
      and profile.active = true
      and case
        when profile.role = 'administrator' then true
        when profile.allowed_permissions is not null then p_permission = any(profile.allowed_permissions)
        when profile.role = 'cashier' then p_permission = any(array['pos:access', 'pos:charge', 'cash-register:own', 'student:read', 'student:abono', 'sales:read'])
        when profile.role = 'inventory' then p_permission = any(array['inventory:read', 'inventory:write', 'student:read'])
        else false
      end
  )
$$;

revoke all on function private.has_app_permission(text) from public, anon;
grant execute on function private.has_app_permission(text) to authenticated;

create or replace function private.can_access_product_category(p_category_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (private.has_app_permission('inventory:read') or private.has_app_permission('pos:access'))
    and exists (
      select 1 from public.profiles profile
      where profile.user_id = (select auth.uid()) and profile.active = true
        and (profile.role = 'administrator' or not profile.category_access_restricted
          or p_category_id = any(profile.allowed_category_ids))
    )
$$;

create or replace function public.record_student_movement(
  p_student_id uuid,
  p_type public.student_movement_type,
  p_value bigint,
  p_detail text,
  p_device_id text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
  v_register uuid;
  v_student public.students%rowtype;
  v_movement public.student_movements%rowtype;
  v_amount bigint;
  v_actor_name text;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  select role, cash_register_id, display_name into v_role, v_register, v_actor_name
    from public.profiles where user_id = (select auth.uid()) and active = true;
  if v_role is null then raise exception 'operation not authorized'; end if;
  if not private.has_app_permission('student:read') then raise exception 'permission denied: student:read'; end if;
  if p_type = 'consumption' and (not private.has_app_permission('pos:charge') or not private.has_app_permission('pos:access')) then raise exception 'permission denied: POS'; end if;
  if p_type in ('top-up', 'debt-payment') and (not private.has_app_permission('student:abono') or not private.has_app_permission('pos:access')) then raise exception 'permission denied: student:abono'; end if;
  if p_type = 'reversal' then raise exception 'use reverse_student_movement'; end if;
  if v_role = 'cashier' and v_register is null then raise exception 'cash register assignment required'; end if;
  if p_value <= 0 then raise exception 'value must be positive'; end if;
  if length(trim(p_detail)) not between 1 and 500 then raise exception 'movement detail is required'; end if;
  if length(trim(p_device_id)) not between 1 and 100 then raise exception 'invalid device'; end if;
  if length(trim(p_idempotency_key)) not between 1 and 200 then raise exception 'idempotency key is required'; end if;

  select * into v_movement from public.student_movements where idempotency_key = p_idempotency_key;
  if found then return to_jsonb(v_movement); end if;
  select * into v_student from public.students where id = p_student_id for update;
  if not found then raise exception 'student not found'; end if;
  if p_type = 'consumption' and v_student.status <> 'active' then raise exception 'student is inactive'; end if;
  v_amount := case when p_type = 'consumption' then -p_value else p_value end;

  insert into public.student_movements (
    student_id, type, amount, detail, actor_user_id, actor_display_name,
    cash_register_id, device_id, idempotency_key
  ) values (
    p_student_id, p_type, v_amount, trim(p_detail), (select auth.uid()), v_actor_name,
    v_register, p_device_id, p_idempotency_key
  ) returning * into v_movement;
  update public.students set net_balance = net_balance + v_amount where id = p_student_id;
  return to_jsonb(v_movement);
end;
$$;

revoke all on function public.record_student_movement(uuid, public.student_movement_type, bigint, text, text, text) from public, anon;
grant execute on function public.record_student_movement(uuid, public.student_movement_type, bigint, text, text, text) to authenticated;

drop policy if exists students_select_pos_admin on public.students;
create policy students_select_pos_admin on public.students for select to authenticated
using (private.has_app_permission('student:read'));
drop policy if exists students_insert_admin on public.students;
create policy students_insert_admin on public.students for insert to authenticated
with check (private.has_app_permission('student:write'));
drop policy if exists students_update_admin on public.students;
create policy students_update_admin on public.students for update to authenticated
using (private.has_app_permission('student:write'))
with check (private.has_app_permission('student:write'));

drop policy if exists movements_select_authorized on public.student_movements;
create policy movements_select_authorized on public.student_movements for select to authenticated
using (
  private.has_app_permission('student:read')
  and ((select private.current_app_role()) = 'administrator'
    or cash_register_id = (select private.current_cash_register_id()))
);

drop policy if exists sales_select_authorized on public.sales;
create policy sales_select_authorized on public.sales for select to authenticated
using (
  private.has_app_permission('sales:read')
  and ((select private.current_app_role()) = 'administrator'
    or cash_register_id = (select private.current_cash_register_id()))
);

create or replace function private.enforce_sale_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_app_permission('pos:charge') then
    raise exception 'permission denied: pos:charge';
  end if;
  if not private.has_app_permission('pos:access') then raise exception 'permission denied: pos:access'; end if;
  if not private.has_app_permission('cash-register:own') then raise exception 'permission denied: cash-register:own'; end if;
  return new;
end;
$$;
revoke all on function private.enforce_sale_permission() from public, anon, authenticated;
drop trigger if exists sale_permission_guard on public.sales;
create trigger sale_permission_guard
before insert on public.sales
for each row execute function private.enforce_sale_permission();

create or replace function private.enforce_inventory_write_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_app_permission('inventory:write') then
    raise exception 'permission denied: inventory:write';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_inventory_write_permission() from public, anon, authenticated;

drop trigger if exists product_inventory_write_guard on public.products;
create trigger product_inventory_write_guard
before insert or update of name, price, active, category_id, subcategory, cost, minimum_stock, sku on public.products
for each row execute function private.enforce_inventory_write_permission();
drop trigger if exists category_inventory_write_guard on public.product_categories;
create trigger category_inventory_write_guard
before insert or update on public.product_categories
for each row execute function private.enforce_inventory_write_permission();

create or replace function private.enforce_stock_movement_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.movement_type in ('sale', 'sale_reversal') then
    if not private.has_app_permission('pos:charge') then raise exception 'permission denied: pos:charge'; end if;
  elsif not private.has_app_permission('inventory:write') then
    raise exception 'permission denied: inventory:write';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_stock_movement_permission() from public, anon, authenticated;
drop trigger if exists stock_movement_permission_guard on public.stock_movements;
create trigger stock_movement_permission_guard
before insert on public.stock_movements
for each row execute function private.enforce_stock_movement_permission();

drop policy if exists products_insert_inventory on public.products;
create policy products_insert_inventory on public.products for insert to authenticated
with check (private.has_app_permission('inventory:write') and private.can_access_product_category(category_id));
drop policy if exists products_update_inventory on public.products;
create policy products_update_inventory on public.products for update to authenticated
using (private.has_app_permission('inventory:write') and private.can_access_product_category(category_id))
with check (private.has_app_permission('inventory:write') and private.can_access_product_category(category_id));
drop policy if exists categories_select_authorized on public.product_categories;
create policy categories_select_authorized on public.product_categories for select to authenticated
using (private.has_app_permission('inventory:read') or private.has_app_permission('pos:access'));

drop policy if exists stock_select_inventory on public.stock_movements;
create policy stock_select_inventory on public.stock_movements for select to authenticated
using (
  (select private.current_app_role()) = 'administrator'
  or (private.has_app_permission('inventory:read') and exists (
    select 1 from public.products
    where products.id = stock_movements.product_id
      and private.can_access_product_category(products.category_id)
  ))
);

-- The role-specific management functions retain their role checks. This helper
-- supplies the granular policy used by the UI and by directly exposed data rules.
