# SQLite-level regression of the EXACT three D1 CAS SQL statements used by V2.
# No production data is read or modified.
import sqlite3
from pathlib import Path
src=Path('src/clan-online.js').read_text()
SQL=[
 'INSERT INTO clan_warehouse_ops_v2(id,clan_id,actor_id,operation,completed_at,ok) VALUES(?1,?2,?3,?4,?5,CASE WHEN EXISTS(SELECT 1 FROM saves WHERE telegram_id=?6 AND version=?7 AND state_json=?8) AND EXISTS(SELECT 1 FROM clan_meta WHERE clan_id=?9 AND storage_json=?10 AND history_json=?11) THEN 1 ELSE 0 END)',
 'UPDATE saves SET version=?1,state_json=?2,updated_at=?3 WHERE telegram_id=?4 AND version=?5 AND state_json=?6 AND EXISTS(SELECT 1 FROM clan_meta WHERE clan_id=?7 AND storage_json=?8 AND history_json=?9)',
 'UPDATE clan_meta SET storage_json=?1,history_json=?2,updated_at=?3 WHERE clan_id=?4 AND storage_json=?5 AND history_json=?6 AND EXISTS(SELECT 1 FROM saves WHERE telegram_id=?7 AND version=?8 AND state_json=?9)',
 'UPDATE clan_warehouse_ops_v2 SET ok=CASE WHEN EXISTS(SELECT 1 FROM saves WHERE telegram_id=?1 AND version=?2 AND state_json=?3) AND EXISTS(SELECT 1 FROM clan_meta WHERE clan_id=?4 AND storage_json=?5 AND history_json=?6) THEN 1 ELSE 0 END WHERE id=?7'
]
assert all(q in src for q in SQL), 'Server SQL changed: update SQLite regression test.'
def make_db():
    c=sqlite3.connect(':memory:')
    c.executescript('CREATE TABLE saves(telegram_id TEXT PRIMARY KEY,version INT,state_json TEXT,updated_at INT);CREATE TABLE clan_meta(clan_id TEXT PRIMARY KEY,storage_json TEXT,history_json TEXT,updated_at INT);CREATE TABLE clan_warehouse_ops_v2(id TEXT PRIMARY KEY,clan_id TEXT,actor_id TEXT,operation TEXT,completed_at INT,ok INT NOT NULL CHECK(ok=1));')
    c.execute('INSERT INTO saves VALUES(?,?,?,?)',('777',7,'{"bag":[{"uid":"hp_medium","kind":"consumable","count":15}]}',0))
    c.execute('INSERT INTO clan_meta VALUES(?,?,?,?)',('alpha','[]','[]',0))
    c.execute('INSERT INTO clan_meta VALUES(?,?,?,?)',('beta','[{"uid":"other-clan"}]','[]',0))
    c.commit()
    return c
def move(c,nonce='test_op_v2_123456',expected_version=7,expected_history='[]'):
    before='{"bag":[{"uid":"hp_medium","kind":"consumable","count":15}]}'
    after='{"bag":[]}'
    wh='[{"uid":"hp_medium","kind":"consumable","count":15}]'
    hist='[{"action":"put"}]'
    with c:
      init=c.execute(SQL[0],(nonce,'alpha','777','put',2,'777',expected_version,before,'alpha','[]',expected_history))
      a=c.execute(SQL[1],(8,after,2,'777',expected_version,before,'alpha','[]',expected_history))
      b=c.execute(SQL[2],(wh,hist,2,'alpha','[]',expected_history,'777',8,after))
      done=c.execute(SQL[3],('777',8,after,'alpha',wh,hist,nonce))
      assert init.rowcount==a.rowcount==b.rowcount==done.rowcount==1
def snap(c):
    return (c.execute('select version,state_json from saves').fetchall(),c.execute('select clan_id,storage_json,history_json from clan_meta order by clan_id').fetchall(),c.execute('select id,operation,ok from clan_warehouse_ops_v2').fetchall())
db=make_db()
base=snap(db)
move(db)
assert snap(db)!=base
assert db.execute('select storage_json from clan_meta where clan_id=?',('alpha',)).fetchone()[0]=='[{"uid":"hp_medium","kind":"consumable","count":15}]'
assert db.execute('select storage_json from clan_meta where clan_id=?',('beta',)).fetchone()[0]=='[{"uid":"other-clan"}]'
after=snap(db)
for kwargs in ({'nonce':'test_op_v2_123456'}, {'nonce':'new_op_v2_123456'}):
    try: move(db,**kwargs)
    except sqlite3.IntegrityError: pass
    else: raise AssertionError('Duplicate or stale operation unexpectedly committed')
    assert snap(db)==after,'SQLite transaction must roll back fully on retry'
db=make_db()
db.execute("UPDATE clan_meta SET history_json='[{\"action\":\"another-user\"}]' WHERE clan_id='alpha'")
db.commit()
race=snap(db)
try: move(db,nonce='race_op_v2_123456')
except sqlite3.IntegrityError: pass
else: raise AssertionError('Concurrent clan history change was not detected')
assert snap(db)==race,'Concurrent metadata change must not partially update player bag'
db=make_db()
before=snap(db)
try: move(db,nonce='stale_op_v2_123456',expected_version=6)
except sqlite3.IntegrityError: pass
else: raise AssertionError('Stale save version was not detected')
assert snap(db)==before,'Stale save must not modify any storage or log'
print('PASS SQLite: atomic commit, no duplicate retry, no lost updates, unchanged other clan, CAS fail rollback, real CHECK(1) guard.')
