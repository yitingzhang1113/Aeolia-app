"""Neo4j projection of discoverable social relationships.

Postgres remains the authority for visibility and consent. Graph queries return IDs only;
the API rechecks permissions before exposing profiles or post text.
"""
import os
import random
from neo4j import GraphDatabase


class Graph:
    def __init__(self):
        self.driver = GraphDatabase.driver(
            os.getenv("NEO4J_URI", "bolt://localhost:7687"),
            auth=(os.getenv("NEO4J_USER", "neo4j"), os.getenv("NEO4J_PASSWORD", "aeolia_dev_password")),
        )

    def close(self):
        self.driver.close()

    def initialize(self):
        self.driver.execute_query("CREATE CONSTRAINT person_id IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE")
        self.driver.execute_query("CREATE CONSTRAINT circle_id IF NOT EXISTS FOR (c:Circle) REQUIRE c.id IS UNIQUE")
        self.driver.execute_query("CREATE CONSTRAINT topic_name IF NOT EXISTS FOR (t:Topic) REQUIRE t.name IS UNIQUE")

    def sync_person(self, user):
        self.driver.execute_query(
            "MERGE (p:Person {id:$id}) SET p.handle=$handle, p.discoverable=$discoverable",
            id=user.id, handle=user.handle, discoverable=user.agent_discoverable,
        )
        # Only explicitly supplied shareable interest tags enter the graph; private agent notes stay in Postgres.
        self.driver.execute_query("MATCH (p:Person {id:$id})-[r:LIKES]->() DELETE r", id=user.id)
        for tag in [x.strip().lower() for x in user.interests.split(",") if x.strip()]:
            self.driver.execute_query(
                "MATCH (p:Person {id:$id}) MERGE (t:Topic {name:$tag}) MERGE (p)-[:LIKES]->(t)",
                id=user.id, tag=tag,
            )

    def sync_membership(self, user_id, circle):
        self.driver.execute_query(
            "MERGE (p:Person {id:$uid}) MERGE (c:Circle {id:$cid}) SET c.name=$name "
            "MERGE (p)-[:IN_CIRCLE]->(c)", uid=user_id, cid=circle.id, name=circle.name,
        )

    def candidates(self, user_id: int, circle_id: int, limit: int = 24):
        """A bounded local neighborhood; randomize locally to avoid a fixed ranking."""
        rows, _, _ = self.driver.execute_query(
            "MATCH (me:Person {id:$uid})-[:IN_CIRCLE]->(c:Circle {id:$cid}) "
            "MATCH (other:Person)-[:IN_CIRCLE]->(c) "
            "WHERE other.id <> $uid AND other.discoverable = true "
            "OPTIONAL MATCH (me)-[:LIKES]->(t:Topic)<-[:LIKES]-(other) "
            "RETURN other.id AS id, other.handle AS handle, collect(DISTINCT t.name) AS shared "
            "LIMIT $cap", uid=user_id, cid=circle_id, cap=max(limit * 4, 40),
        )
        people = [dict(row) for row in rows]
        random.shuffle(people)
        return people[:limit]
