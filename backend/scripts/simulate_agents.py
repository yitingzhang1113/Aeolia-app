"""Seed 20 fictional users, synchronize Neo4j, and run real model introductions.

From backend: python -m scripts.simulate_agents [--seed-only]
The API must use the same local database as this script. Re-runs reuse transcripts.
"""
import argparse
import json
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from sqlalchemy import select

from app.main import SessionLocal
from app.graph import Graph
from app.models import Circle, Encounter, Membership, Post, SocialProfile, User, UserLocation


from scripts.personas import make_personas


PEOPLE = [
    ("Aria", "Illustrator", "city sketches,coffee,watercolors", "Painting café windows in soft morning light."),
    ("Noah", "Game designer", "cozy games,board games,coffee", "Testing a cooperative game about running a tiny café."),
    ("Luna", "Photographer", "city sketches,photography,walking", "A photo walk through the neighborhood at golden hour."),
    ("Ethan", "Animator", "indie games,animation,city sketches", "Sketching characters for a little adventure game."),
    ("Sofia", "Ceramic artist", "coffee,ceramics,art", "Making a new set of handmade coffee cups."),
    ("Oliver", "Developer", "board games,cozy games,music", "Looking for a friendly cooperative board game."),
    ("Isla", "Writer", "city sketches,books,coffee", "Collecting café observations for a short story."),
    ("Lucas", "Musician", "indie games,music,coffee", "Writing a relaxing soundtrack for a cozy game."),
    ("Mia", "Architect", "city sketches,architecture,walking", "Drawing the small details on old buildings."),
    ("Theo", "Teacher", "board games,books,art", "Trying a drawing game that beginners can enjoy."),
    ("Zoe", "Designer", "city sketches,coffee,typography", "Sketching interesting signs around the city."),
    ("Finn", "Engineer", "cozy games,board games,cooking", "Trying a new recipe between board-game rounds."),
    ("Ivy", "Gardener", "city sketches,nature,watercolors", "Painting the plants in a community garden."),
    ("Jasper", "Artist", "indie games,animation,art", "Making pixel art for a quiet exploration game."),
    ("Nora", "Baker", "coffee,cooking,photography", "Practicing food photos with fresh sourdough."),
    ("Felix", "Researcher", "board games,books,puzzles", "Exploring puzzle games with simple rules."),
    ("Ruby", "Student", "city sketches,art,books", "Starting a sketchbook with one drawing every day."),
    ("Oscar", "Producer", "indie games,music,board games", "Making a playlist for a relaxed game night."),
    ("Ada", "Product designer", "coffee,city sketches,cozy games", "Designing a little virtual neighborhood café."),
    ("Hugo", "Librarian", "board games,books,cozy games", "Collecting story-driven games for a community shelf."),
]


def seed(db):
    users = []
    circle = db.get(Circle, 1)
    if circle and circle.slug == "sf-creatives":
        circle.slug, circle.name = "art-creativity", "Art & Creativity"
        circle.description = "Drawing, design and creative hobbies."
    for index, ((name, job, interests, post), persona) in enumerate(zip(PEOPLE, make_personas())):
        handle = f"sim.{name.lower()}.2048"
        user = db.scalar(select(User).where(User.handle == handle))
        if not user:
            user = User(handle=handle, name=name, city="San Francisco", job=job,
                        bio="[Simulation] Fictional demo member. " + post,
                        interests=interests, outfit=["teal", "apricot", "sage", "navy"][index % 4],
                        agent_discoverable=True, agent_chat_allowed=True)
            db.add(user)
            db.flush()
        for field in ("city", "bio", "interests", "preference_note"):
            setattr(user, field, persona[field])
        social = db.get(SocialProfile, user.id)
        if not social:
            social = SocialProfile(user_id=user.id)
            db.add(social)
        for field in ("intent", "age", "height_cm", "minimum_height_cm", "required_city"):
            setattr(social, field, persona[field])
        location = db.get(UserLocation, user.id)
        if not location:
            location = UserLocation(user_id=user.id)
            db.add(location)
        for field in ("latitude", "longitude", "radius_km"):
            setattr(location, field, persona[field])
        for circle_id in (1, 2):
            if not db.get(Circle, circle_id):
                raise RuntimeError("Start the API first to create the demo circles")
            if not db.scalar(select(Membership).where(Membership.user_id == user.id, Membership.circle_id == circle_id)):
                db.add(Membership(user_id=user.id, circle_id=circle_id, follow=True, explore=True))
        body = persona["post"]
        # Update this fictional user's old seed post instead of leaving a conflicting persona.
        previous = db.scalar(select(Post).where(Post.author_id == user.id, Post.body.like("[Simulation]%")))
        if previous:
            previous.body = body
        if not db.scalar(select(Post.id).where(Post.author_id == user.id, Post.body == body)):
            db.add(Post(author_id=user.id, circle_id=index % 2 + 1, visibility="public", body=body))
        users.append(user)
    db.commit()
    return users


def request(base, path, user, data=None):
    req = Request(base + path, data=json.dumps(data or {}).encode(),
                  headers={"Content-Type": "application/json", "X-User-Id": str(user)}, method="POST")
    with urlopen(req, timeout=1200) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://localhost:8000")
    parser.add_argument("--seed-only", action="store_true")
    parser.add_argument("--refresh", action="store_true", help="Archive previous simulation screenings and generate new ones")
    args = parser.parse_args()
    if urlparse(args.url).hostname not in {"localhost", "127.0.0.1", "::1"}:
        parser.error("Only a local development API is supported")
    with SessionLocal() as db:
        users = seed(db)
        graph = Graph()
        try:
            graph.initialize()
            for user in db.scalars(select(User)):
                graph.sync_person(user)
            for membership in db.scalars(select(Membership)):
                graph.sync_membership(membership.user_id, db.get(Circle, membership.circle_id))
        finally:
            graph.close()
        print(f"Seeded {len(users)} simulation users; synchronized Neo4j", flush=True)
        for user in users:
            print(json.dumps({"user": user.handle, "bio": user.bio, "city": user.city,
                              "private_preferences": user.preference_note}, ensure_ascii=False), flush=True)
        if args.seed_only:
            return
        if args.refresh:
            for old in db.scalars(select(Encounter).where(Encounter.owner_id.in_([1, *[u.id for u in users]]))):
                old.status = "superseded"
            db.commit()
        completed, failures = 0, []
        # Every simulated user initiates one graph-based introduction. Include the
        # current demo account so its transcript is directly visible in the app.
        for index, user in enumerate([db.get(User, 1), *users]):
            circle_id = index % 2 + 1
            try:
                encounter = db.scalar(select(Encounter).where(
                    Encounter.owner_id == user.id,
                    Encounter.candidate_id.in_([u.id for u in users]),
                    Encounter.status == "recommended",
                ).order_by(Encounter.id.desc()))
                encounter_id = encounter.id if encounter else None
                for _ in range(1):
                    if encounter_id:
                        break
                    route = "/explore/nearby" if db.get(UserLocation, user.id) else f"/explore/{circle_id}"
                    candidate = request(args.url, route, user.id)
                    if candidate.get("candidate", {}).get("id") in {u.id for u in users}:
                        encounter_id = candidate.get("id")
                if not encounter_id:
                    print(json.dumps({"user": user.handle, "result": "No match passed screening"}), flush=True)
                    continue
                result = request(args.url, f"/encounters/{encounter_id}/agent-chat", user.id)
                print(json.dumps({"user": user.handle, "encounter": encounter_id, "turns": result["turns"]}, ensure_ascii=False), flush=True)
                completed += 1
            except Exception as error:
                failures.append({"user": user.handle, "error": str(error)})
                print(json.dumps(failures[-1]), flush=True)
        print(json.dumps({"completed": completed, "failures": failures}), flush=True)
        if failures:
            raise SystemExit(1)


if __name__ == "__main__":
    main()
