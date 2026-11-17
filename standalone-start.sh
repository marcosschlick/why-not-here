set -Eeuo pipefail

database_dir=/var/lib/why-not-here/postgres
postgres_bin=(/usr/lib/postgresql/*/bin)
postgres_bin=${postgres_bin[0]}

mkdir -p "$database_dir"
chown -R postgres:postgres "$database_dir"

if [ ! -s "$database_dir/PG_VERSION" ]; then
  runuser -u postgres -- "$postgres_bin/initdb" -D "$database_dir" --auth-local=trust --auth-host=trust
fi

cleanup() {
  trap - EXIT INT TERM
  jobs -pr | xargs -r kill 2>/dev/null || true
  runuser -u postgres -- "$postgres_bin/pg_ctl" -D "$database_dir" -m fast -w stop || true
}
trap cleanup EXIT
trap 'exit 0' INT TERM

runuser -u postgres -- "$postgres_bin/pg_ctl" -D "$database_dir" -o '-h 127.0.0.1' -w start
if ! runuser -u postgres -- "$postgres_bin/psql" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'why_not_here'" | grep -q 1; then
  runuser -u postgres -- "$postgres_bin/createdb" why_not_here
fi

uvicorn web.api.app:app --host 127.0.0.1 --port 8000 --no-proxy-headers &
backend_pid=$!
until python -B -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/api/status', timeout=3)" 2>/dev/null; do
  kill -0 "$backend_pid" 2>/dev/null || exit 1
  sleep 1
done

uvicorn web.api.public_app:app --host 127.0.0.1 --port 8001 --no-proxy-headers &
cd /app/web/frontend
VITE_BACKEND_URL=http://127.0.0.1:8000 VITE_PUBLIC_BASE_URL="${PUBLIC_PARTICIPANT_URL:-http://localhost:5174}" npm run dev -- --host 0.0.0.0 --port 5173 &
VITE_BACKEND_URL=http://127.0.0.1:8001 VITE_PUBLIC_ONLY=true VITE_PUBLIC_BASE_URL="${PUBLIC_PARTICIPANT_URL:-http://localhost:5174}" npm run dev -- --host 0.0.0.0 --port 5174 &
wait -n
