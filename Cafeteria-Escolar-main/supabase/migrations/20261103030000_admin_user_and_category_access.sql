alter table public.profiles
  add column category_access_restricted boolean not null default false,
  add column allowed_category_ids uuid[] not null default '{}';

create or replace function private.can_access_product_category(p_category_id uuid)
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
      and profile.role in ('administrator', 'cashier', 'inventory')
      and (
        profile.role = 'administrator'
        or not profile.category_access_restricted
        or p_category_id = any(profile.allowed_category_ids)
      )
  )
$$;

revoke all on function private.can_access_product_category(uuid) from public, anon;
grant execute on function private.can_access_product_category(uuid) to authenticated;

create or replace function public.save_inventory_category(
  p_id uuid,
  p_name text,
  p_slug text,
  p_active boolean
)
returns public.product_categories
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
  v_restricted boolean;
  v_category public.product_categories%rowtype;
begin
  select role, category_access_restricted into v_role, v_restricted
  from public.profiles where user_id = (select auth.uid()) and active = true;
  if v_role is null or v_role not in ('administrator', 'inventory')
    or (v_role = 'inventory' and v_restricted) then
    raise exception 'operation not authorized';
  end if;
  if length(trim(p_name)) not between 1 and 80 then raise exception 'invalid category name'; end if;
  if trim(p_slug) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'invalid category slug'; end if;

  insert into public.product_categories (id, name, slug, active)
  values (coalesce(p_id, gen_random_uuid()), trim(p_name), trim(p_slug), coalesce(p_active, true))
  on conflict (id) do update set name = excluded.name, slug = excluded.slug, active = excluded.active
  returning * into v_category;
  return v_category;
end;
$$;

create or replace function public.save_inventory_product(
  p_id text,
  p_name text,
  p_category_id uuid,
  p_subcategory text,
  p_price bigint,
  p_cost bigint,
  p_minimum_stock integer,
  p_sku text,
  p_active boolean
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
  v_product public.products%rowtype;
  v_existing_category_id uuid;
  v_id text := coalesce(nullif(trim(p_id), ''), gen_random_uuid()::text);
begin
  select role into v_role from public.profiles
  where user_id = (select auth.uid()) and active = true;
  if v_role is null or v_role not in ('administrator', 'inventory') then
    raise exception 'operation not authorized';
  end if;
  if length(trim(p_name)) not between 1 and 150 then raise exception 'invalid product name'; end if;
  if length(trim(p_subcategory)) not between 1 and 80 then raise exception 'invalid subcategory'; end if;
  if p_price < 0 or p_cost < 0 or p_minimum_stock < 0 then raise exception 'values cannot be negative'; end if;
  if not exists (select 1 from public.product_categories where id = p_category_id and active = true) then
    raise exception 'active category required';
  end if;
  if not private.can_access_product_category(p_category_id) then raise exception 'product category access denied'; end if;

  if nullif(trim(p_id), '') is not null then
    select category_id into v_existing_category_id from public.products where id = p_id;
    if found and not private.can_access_product_category(v_existing_category_id) then
      raise exception 'product category access denied';
    end if;
  end if;

  insert into public.products (id, name, category_id, subcategory, price, cost, minimum_stock, sku, active)
  values (v_id, trim(p_name), p_category_id, trim(p_subcategory), p_price, p_cost, p_minimum_stock, nullif(trim(p_sku), ''), coalesce(p_active, true))
  on conflict (id) do update set
    name = excluded.name, category_id = excluded.category_id, subcategory = excluded.subcategory,
    price = excluded.price, cost = excluded.cost, minimum_stock = excluded.minimum_stock,
    sku = excluded.sku, active = excluded.active
  returning * into v_product;
  return v_product;
end;
$$;

create or replace function public.record_stock_movement(
  p_product_id text,
  p_quantity_delta integer,
  p_movement_type text,
  p_reason text,
  p_idempotency_key text
)
returns public.stock_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
  v_product public.products%rowtype;
  v_movement public.stock_movements%rowtype;
begin
  select role into v_role from public.profiles
  where user_id = (select auth.uid()) and active = true;
  if v_role is null or v_role not in ('administrator', 'inventory') then raise exception 'operation not authorized'; end if;
  if p_quantity_delta = 0 then raise exception 'quantity delta cannot be zero'; end if;
  if p_movement_type not in ('opening', 'entry', 'adjustment') then raise exception 'invalid manual movement type'; end if;
  if length(trim(p_reason)) not between 3 and 300 then raise exception 'reason is required'; end if;
  if length(trim(p_idempotency_key)) not between 1 and 200 then raise exception 'idempotency key is required'; end if;

  select * into v_movement from public.stock_movements where idempotency_key = p_idempotency_key;
  if found then return v_movement; end if;
  select * into v_product from public.products where id = p_product_id for update;
  if not found then raise exception 'product not found'; end if;
  if not private.can_access_product_category(v_product.category_id) then raise exception 'product category access denied'; end if;
  if v_product.stock_quantity + p_quantity_delta < 0 then raise exception 'insufficient stock'; end if;

  update public.products set stock_quantity = stock_quantity + p_quantity_delta where id = p_product_id;
  insert into public.stock_movements (product_id, quantity_delta, reason, actor_user_id, movement_type, idempotency_key)
  values (p_product_id, p_quantity_delta, trim(p_reason), (select auth.uid()), p_movement_type, trim(p_idempotency_key))
  returning * into v_movement;
  return v_movement;
end;
$$;

drop policy if exists products_select_authorized on public.products;
create policy products_select_authorized on public.products for select to authenticated
using (private.can_access_product_category(category_id));

drop policy if exists categories_select_authorized on public.product_categories;
create policy categories_select_authorized on public.product_categories for select to authenticated
using (private.can_access_product_category(id));

drop policy if exists stock_select_inventory on public.stock_movements;
create policy stock_select_inventory on public.stock_movements for select to authenticated
using (
  (select private.current_app_role()) = 'administrator'
  or (
    (select private.current_app_role()) = 'inventory'
    and exists (
      select 1 from public.products
      where products.id = stock_movements.product_id
        and private.can_access_product_category(products.category_id)
    )
  )
);

create or replace function private.enforce_sale_item_category_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category_id uuid;
begin
  select category_id into v_category_id
  from public.products
  where id = new.product_id;

  if v_category_id is null or not private.can_access_product_category(v_category_id) then
    raise exception 'product category access denied';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_sale_item_category_access() from public, anon, authenticated;
create trigger sale_item_category_access_guard
before insert or update of product_id on public.sale_items
for each row execute function private.enforce_sale_item_category_access();

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
  ) then
    raise exception 'operation not authorized';
  end if;

  if length(trim(p_name)) not between 1 and 80 then
    raise exception 'El nombre de la caja debe tener entre 1 y 80 caracteres.';
  end if;

  if p_id is null then
    insert into public.cash_registers (name, active)
    values (trim(p_name), coalesce(p_active, true))
    returning * into v_register;
  else
    update public.cash_registers
    set name = trim(p_name), active = coalesce(p_active, true)
    where id = p_id
    returning * into v_register;

    if not found then raise exception 'No se encontró la caja.'; end if;
  end if;

  if p_user_id is not null then
    if not v_register.active then
      raise exception 'No se puede asignar un cajero a una caja inactiva.';
    end if;

    update public.profiles
    set cash_register_id = v_register.id
    where user_id = p_user_id and active = true and role = 'cashier';

    if not found then raise exception 'El usuario elegido no es un cajero activo.'; end if;
  end if;

  return v_register;
end;
$$;

revoke all on function public.admin_save_cash_register(uuid, text, boolean, uuid) from public, anon;
grant execute on function public.admin_save_cash_register(uuid, text, boolean, uuid) to authenticated;
