-- inventory and purchase_order_items policies
SELECT tablename, policyname, cmd, qual FROM pg_policies
WHERE schemaname='public'
AND tablename IN ('inventory', 'purchase_order_items', 'purchase_orders')
ORDER BY tablename, cmd;
