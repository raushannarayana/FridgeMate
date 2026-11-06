"""Copy your FridgeMate SQLite database into PostgreSQL WITHOUT changing or deleting anything in the SQLite file.

Safety rules built in:
  * The SQLite file is opened READ-ONLY. It is never modified.
  * Default mode is a REHEARSAL: the data is copied into a throw-away database in memory and checked. Nothing online is touched.
  * --execute writes to PostgreSQL, but ONLY if every FridgeMate table there is empty (it never overwrites or merges).
  * Everything is written in ONE transaction: if any step fails, nothing is saved ("all or nothing").
  * Row counts are compared table by table before the transaction is committed.
  * The PostgreSQL address (it contains your password) is typed with hidden input or read from TARGET_DATABASE_URL, and is never printed.

Usage (run inside the backend folder, after `pip install -r requirements.txt "psycopg[binary]==3.2.3"`):
  python migrate_sqlite_to_postgres.py --sqlite path/to/fridgemate.db               # 1) rehearsal
  python migrate_sqlite_to_postgres.py --sqlite path/to/fridgemate.db --execute     # 2) real copy (asks for the Postgres address)
"""
import argparse, getpass, os, pathlib, secrets, sqlite3, sys

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("--sqlite", required=True, help="path to your existing fridgemate.db (a COPY is safest)")
ap.add_argument("--execute", action="store_true", help="really write to PostgreSQL (default: rehearsal in memory)")
args = ap.parse_args()

src_path = pathlib.Path(args.sqlite).expanduser().resolve()
if not src_path.is_file(): sys.exit(f"Cannot find the SQLite file: {src_path}")

# Choose the target BEFORE importing main.py (main.py reads DATABASE_URL when it is imported).
if args.execute:
    target = os.getenv("TARGET_DATABASE_URL") or getpass.getpass("Paste the PostgreSQL connection address (input is hidden): ").strip()
    if not target.startswith(("postgres://", "postgresql://", "postgresql+psycopg://")): sys.exit("That does not look like a PostgreSQL address (it should start with postgresql://).")
    os.environ["DATABASE_URL"] = target
else:
    os.environ["DATABASE_URL"] = "sqlite://"  # in-memory rehearsal database, thrown away at the end
os.environ["DEMO_MODE"] = "false"  # importing main.py must never add demo accounts
os.environ.setdefault("JWT_SECRET", secrets.token_urlsafe(32))  # needed only so main.py can be imported; this script never serves requests

from sqlalchemy import create_engine, inspect, select, func, text  # noqa: E402
import main  # noqa: E402  (creates any MISSING tables on the target; never alters or deletes existing ones)

# Read-only source. "mode=ro" makes SQLite itself refuse every write.
src = create_engine("sqlite://", creator=lambda: sqlite3.connect(src_path.as_uri() + "?mode=ro", uri=True))
tgt = main.engine
is_pg = tgt.dialect.name == "postgresql"
print(f"Source : {src_path.name} (read-only)")
print(f"Target : {'PostgreSQL (real copy)' if args.execute else 'in-memory rehearsal (nothing online is touched)'}\n")

with src.connect() as c:
    if c.execute(text("PRAGMA integrity_check")).scalar() != "ok": sys.exit("The SQLite file failed its integrity check. Stopping; nothing was changed.")
src_tables = set(inspect(src).get_table_names())
tables = main.Base.metadata.sorted_tables  # parents before children, so foreign keys are satisfied
plan = []
for t in tables:
    if t.name not in src_tables: print(f"  {t.name:24s} not in the SQLite file - skipped (stays empty)"); continue
    have = {col["name"] for col in inspect(src).get_columns(t.name)}
    cols = [c for c in t.c if c.name in have]
    missing = [c.name for c in t.c if c.name not in have]
    if missing: print(f"  {t.name:24s} columns missing in old file (defaults will be used): {', '.join(missing)}")
    plan.append((t, cols))

with tgt.connect() as c:  # never write into a database that already has data
    for t, _ in plan:
        n = c.execute(select(func.count()).select_from(t)).scalar()
        if n: sys.exit(f"STOP: table '{t.name}' in the target already has {n} rows. This script only copies into an EMPTY database. Nothing was changed.")

try:
    with tgt.begin() as out, src.connect() as inn:  # one transaction: all or nothing
        for t, cols in plan:
            rows = [dict(r._mapping) for r in inn.execute(select(*cols))]  # typed by the model, so dates arrive as real dates
            for i in range(0, len(rows), 500): out.execute(t.insert(), rows[i:i + 500])
            copied = out.execute(select(func.count()).select_from(t)).scalar()
            ok = copied == len(rows)
            print(f"  {t.name:24s} {len(rows):6d} rows read, {copied:6d} rows in target  {'OK' if ok else 'MISMATCH'}")
            if not ok: raise RuntimeError(f"Row count mismatch in {t.name}")
        if is_pg:  # we copied explicit ids, so tell PostgreSQL to continue numbering after the highest one
            for t, _ in plan:
                if "id" in t.c: out.execute(text(f"SELECT setval(pg_get_serial_sequence('{t.name}', 'id'), COALESCE((SELECT MAX(id) FROM {t.name}), 1), (SELECT MAX(id) IS NOT NULL FROM {t.name}))"))
        if not args.execute: raise RuntimeError("__rehearsal_done__")  # rehearsal: roll back on purpose so nothing is kept
except RuntimeError as e:
    if str(e) != "__rehearsal_done__": sys.exit(f"\nFAILED and rolled back (nothing was saved): {e}")
    print("\nREHEARSAL PASSED: every table copied and every row count matched. Nothing was written anywhere.")
    print("Next: run again with --execute to do the real copy.")
except Exception as e:  # e.g. an old row pointing at a deleted user (SQLite does not enforce this, PostgreSQL does)
    sys.exit(f"\nFAILED and rolled back (nothing was saved): {type(e).__name__}: {str(e)[:300]}")
else:
    print("\nDONE. All rows were copied and verified. Your SQLite file was not changed.")
