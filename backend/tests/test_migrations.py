from sqlalchemy import create_engine, inspect
from app.migrations import allow_location_encounters


def test_location_migration_preserves_encounters_and_transcripts(tmp_path):
    path = tmp_path / "legacy.db"
    engine = create_engine(f"sqlite:///{path}")
    with engine.begin() as db:
        db.exec_driver_sql("CREATE TABLE encounters (id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL, candidate_id INTEGER NOT NULL, circle_id INTEGER NOT NULL, reason TEXT NOT NULL, evidence TEXT NOT NULL, path TEXT NOT NULL, status VARCHAR(24) NOT NULL, created_at DATETIME NOT NULL)")
        db.exec_driver_sql("CREATE TABLE agent_turns (id INTEGER PRIMARY KEY, encounter_id INTEGER REFERENCES encounters(id), body TEXT)")
        db.exec_driver_sql("INSERT INTO encounters VALUES (1,1,2,1,'reason','[]','[]','suggested','2026-09-23')")
        db.exec_driver_sql("INSERT INTO agent_turns VALUES (1,1,'Existing real conversation')")
    allow_location_encounters(engine)
    allow_location_encounters(engine)
    assert next(c for c in inspect(engine).get_columns("encounters") if c["name"] == "circle_id")["nullable"]
    with engine.begin() as db:
        assert db.exec_driver_sql("SELECT reason FROM encounters").scalar() == "reason"
        assert db.exec_driver_sql("SELECT body FROM agent_turns WHERE encounter_id=1").scalar() == "Existing real conversation"
        db.exec_driver_sql("INSERT INTO encounters VALUES (2,1,3,NULL,'nearby','[]','[]','recommended','2026-09-23')")
    assert (tmp_path / "legacy.db.before-location.db").exists()
    engine.dispose()
