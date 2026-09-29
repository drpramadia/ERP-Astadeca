-- Check apply_qc_inspection in remote DB
SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname='apply_qc_inspection' ORDER BY oid;
