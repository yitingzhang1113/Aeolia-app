"""Reproducibly randomized fictional adults; no traits are inferred from real users."""
import random


def make_personas(seed=2048):
    rng = random.Random(seed)
    goals = ["new_in_town", "anime", "dating", "dating", "activity"] * 4
    rng.shuffle(goals)
    personas = []
    for index, goal in enumerate(goals):
        age = rng.randint(23, 36)
        height = rng.choice([165, 170, 175, 180, 182, 185, 188, None])
        city = rng.choice(["San Francisco", "San Francisco", "Oakland"])
        minimum = None
        required_city = None
        if goal == "new_in_town":
            city = "San Francisco"
            required_city = "San Francisco"
            interests = "coffee,city walks,city sketches"
            bio = "New in town — just moved to SF and looking for local friends to explore neighborhoods with. Friendship only."
            preference = "Friendship, not dating. Recommend someone in San Francisco who enjoys casual neighborhood walks or coffee."
            post = "New to SF! What neighborhood would you suggest for a relaxed first coffee walk?"
        elif goal == "anime":
            favorite = rng.choice(["Frieren", "One Piece", "Spy x Family", "Haikyuu"])
            interests = f"anime,manga,{favorite.lower()},cozy games"
            bio = f"Looking for anime and manga friends. Currently enjoying {favorite}; happy to swap recommendations. Friendship only."
            preference = "Friendship, not dating. Only recommend people who explicitly share anime or manga interests."
            post = f"Watching {favorite} lately. Looking for anime friends for episode discussions and manga café visits."
        elif goal == "dating":
            minimum = rng.choice([None, 181, 181])
            interests = rng.choice(["anime,coffee,city walks", "cooking,music,coffee", "photography,hiking,city walks"])
            bio = "Open to dating and getting to know someone gradually over coffee and shared hobbies."
            preference = "Dating only. The other person must explicitly be open to dating."
            if minimum:
                preference += " Only recommend people taller than 180 cm (181 cm or above). Unknown height does not qualify."
            post = "Open to dating: a relaxed coffee and a conversation about shared hobbies sounds like a nice start."
        else:
            activity = rng.choice(["board games", "hiking", "city sketches", "photography"])
            interests = f"{activity},coffee,weekend activities"
            bio = f"Looking for platonic {activity} buddies for low-pressure weekend activities."
            preference = f"Friendship, not dating. Prefer someone who explicitly likes {activity}; do not assume their availability."
            post = f"Anyone interested in {activity}? Would love to exchange ideas with other beginners."
        intent = "dating" if goal == "dating" else "friendship"
        public = f"[Simulation] Fictional adult, {age}. " + (f"Height: {height} cm. " if height else "Height not shared. ") + bio
        center = (37.7749, -122.4194) if city == "San Francisco" else (37.8044, -122.2712)
        latitude, longitude = round(center[0] + rng.uniform(-0.025, 0.025), 2), round(center[1] + rng.uniform(-0.025, 0.025), 2)
        personas.append(dict(goal=goal, intent=intent, age=age, height_cm=height, city=city,
                             latitude=latitude, longitude=longitude, radius_km=rng.choice([10, 25, 50]),
                             minimum_height_cm=minimum, required_city=required_city, interests=interests,
                             bio=public, preference_note=preference, post="[Simulation] " + post))
    return personas
