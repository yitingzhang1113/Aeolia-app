"""Allow location-based encounters without attaching them to an interest circle."""
from sqlalchemy import inspect


def allow_location_encounters(engine):
    schema = inspect(engine)
    if "encounters" not in schema.get_table_names():
        return
    column = next(c for c in schema.get_columns("encounters") if c["name"] == "circle_id")
    if column["nullable"]:
        return
    if engine.dialect.name == "postgresql":
        with engine.begin() as connection:
            connection.exec_driver_sql("ALTER TABLE encounters ALTER COLUMN circle_id DROP NOT NULL")
        return
    if engine.dialect.name != "sqlite":
        raise RuntimeError("Migrate encounters.circle_id to nullable for this database")
    import sqlite3
    from pathlib import Path
    database = engine.url.database
    if database and database != ":memory:":
        backup = Path(database + ".before-location.db")
        if not backup.exists():
            with sqlite3.connect(database) as source, sqlite3.connect(backup) as target:
                source.backup(target)
    with engine.connect() as connection:
        foreign_keys = connection.exec_driver_sql("PRAGMA foreign_keys").scalar()
        connection.commit()
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        connection.commit()
        try:
            with connection.begin():
                connection.exec_driver_sql("""CREATE TABLE encounters_location (
                    id INTEGER NOT NULL PRIMARY KEY,
                    owner_id INTEGER NOT NULL REFERENCES users(id),
                    candidate_id INTEGER NOT NULL REFERENCES users(id),
                    circle_id INTEGER REFERENCES circles(id),
                    reason TEXT NOT NULL, evidence TEXT NOT NULL, path TEXT NOT NULL,
                    status VARCHAR(24) NOT NULL, created_at DATETIME NOT NULL)""")
                connection.exec_driver_sql("INSERT INTO encounters_location SELECT id, owner_id, candidate_id, circle_id, reason, evidence, path, status, created_at FROM encounters")
                connection.exec_driver_sql("DROP TABLE encounters")
                connection.exec_driver_sql("ALTER TABLE encounters_location RENAME TO encounters")
        finally:
            connection.exec_driver_sql(f"PRAGMA foreign_keys={int(foreign_keys)}")
            connection.commit()
