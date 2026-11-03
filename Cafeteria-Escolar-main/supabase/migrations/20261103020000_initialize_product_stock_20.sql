-- Sets every existing product to the authorized opening quantity of 20 units.
-- Each adjustment is recorded once so the inventory ledger stays auditable.
do $$
declare
  v_actor uuid;
  v_product record;
  v_delta integer;
  v_key text;
begin
  select user_id
  into v_actor
  from public.profiles
  where role = 'administrator' and active = true
  order by created_at
  limit 1;

  if v_actor is null then
    raise exception 'An active administrator profile is required to initialize product stock.';
  end if;

  for v_product in
    select id, stock_quantity
    from public.products
    order by id
  loop
    v_key := 'opening-stock-20-20261103:' || v_product.id;

    if not exists (
      select 1
      from public.stock_movements
      where idempotency_key = v_key
    ) then
      v_delta := 20 - v_product.stock_quantity;

      if v_delta <> 0 then
        update public.products
        set stock_quantity = 20
        where id = v_product.id;

        insert into public.stock_movements (
          product_id,
          quantity_delta,
          reason,
          actor_user_id,
          movement_type,
          idempotency_key
        ) values (
          v_product.id,
          v_delta,
          'Existencia inicial autorizada: 20 unidades por producto.',
          v_actor,
          case when v_product.stock_quantity = 0 then 'opening' else 'adjustment' end,
          v_key
        );
      end if;
    end if;
  end loop;
end;
$$;
