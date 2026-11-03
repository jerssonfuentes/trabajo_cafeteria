drop policy if exists categories_select_authorized on public.product_categories;
create policy categories_select_authorized on public.product_categories for select to authenticated
using (private.can_access_product_category(id));
