#!/usr/bin/env bash
# Crea una base local, aplica migraciones + seed y ejecuta las pruebas de permisos
set -euo pipefail
DB=rabeat_test
cd "$(dirname "$0")/.."
su postgres -c "dropdb --if-exists $DB && createdb $DB" >/dev/null
run() { su postgres -c "psql -v ON_ERROR_STOP=1 -q -d $DB -f $1" ; }
for r in anon authenticated service_role; do su postgres -c "psql -q -d $DB -c 'drop role if exists $r'" >/dev/null 2>&1 || true; done
run scripts/local-auth-stub.sql
for f in supabase/migrations/*_schema.sql supabase/migrations/*_security.sql supabase/migrations/*_functions.sql; do run "$f"; done
run supabase/seed.sql
run scripts/test-db.sql
