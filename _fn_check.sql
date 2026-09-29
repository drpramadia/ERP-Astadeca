SELECT proname, pronargs, proargnames, nargdefaults,
       pg_get_function_arguments(oid) as full_args
FROM pg_proc WHERE proname IN ('apply_qc_inspection','create_receiving_from_po','create_qc_from_receiving')
ORDER BY proname;
