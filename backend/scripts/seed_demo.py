"""Add repeatable posts, friendships, chats and plans to the local development API.

Run: python backend/scripts/seed_demo.py
Existing records are retained; running this again does not duplicate demo content.
"""
import argparse
import json
from urllib.parse import urlparse
from urllib.request import Request, urlopen


POSTS = [
    (1, "[Demo] A little coffee, a little sketching. Who's up for a creative weekend?", "friends", None),
    (2, "[Demo] Slow morning, good coffee, messy city sketches. Found a tiny café with the best window seat.", "public", 1),
    (3, "[Demo] Anyone up for a low-key sketch walk this weekend? All skill levels welcome!", "friends", None),
    (4, "[Demo] A cozy board-game night: one new game, old friends, and plenty of snacks.", "public", 2),
]
CONVERSATIONS = {
    2: [(2, "[Demo conversation] Hey! What have you been drawing lately?"),
        (1, "Mostly little city sketches. Want to try a sketch walk sometime?"),
        (2, "That sounds fun! We could get coffee first."),
        (1, "Perfect. Saturday afternoon?"),
        (2, "I'm in! Bring your sketchbook ☕")],
    3: [(3, "[Demo conversation] I found a lovely spot for our next sketch walk."),
        (1, "Ooh, where is it?"),
        (3, "Near the waterfront. There are benches and a coffee cart!"),
        (1, "That sounds like a perfect Sunday."),
        (3, "Want to grab coffee this week too?")],
    4: [(4, "[Demo conversation] Do you prefer cozy games or strategy games?"),
        (1, "Cozy games, but I’m always happy to learn something new."),
        (4, "Then let's start with a quick drawing game."),
        (1, "Deal! I'll bring snacks."),
        (4, "Game night is going to be good 🎲")],
}


def seed(request):
    counts = {"posts": 0, "messages": 0, "events": 0}
    for user, handle in [(1, "yiting.2048"), (2, "kai.2048"), (3, "maya.2048"), (4, "leo.2048")]:
        assert request("GET", "/me", user)["handle"] == handle, "Expected Aeolia demo accounts"
    for friend in CONVERSATIONS:
        request("POST", f"/users/{friend}/follow", 1)
        request("POST", "/users/1/follow", friend)
    for circle in [1, 2]:
        request("PATCH", f"/circles/{circle}", 1, {"follow": True})
    for author, body, visibility, circle in POSTS:
        existing = request("GET", "/feed?tab=for_you", author)
        if not any(p["author"]["id"] == author and p["body"] == body for p in existing):
            request("POST", "/posts", author, {"body": body, "visibility": visibility, "circle_id": circle})
            counts["posts"] += 1
    for friend, turns in CONVERSATIONS.items():
        existing = request("GET", f"/messages/{friend}", 1)
        seen = {(m["sender_id"], m["body"]) for m in existing}
        for sender, body in turns:
            if (sender, body) not in seen:
                request("POST", "/messages", sender, {"recipient_id": friend if sender == 1 else 1, "body": body})
                counts["messages"] += 1
    existing_events = request("GET", "/events", 1)
    for title, kind, location, creator in [
        ("[Demo] Coffee & sketches", "meetup", "San Francisco · waterfront", 3),
        ("[Demo] Draw & Guess tonight", "game", None, 4),
    ]:
        if not any(e["title"] == title and e["creator"]["id"] == creator for e in existing_events):
            request("POST", "/events", creator, {"title": title, "kind": kind, "location": location})
            counts["events"] += 1
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://localhost:8000")
    args = parser.parse_args()
    if urlparse(args.url).hostname not in ("localhost", "127.0.0.1", "::1"):
        parser.error("This demo seeder only supports a local development API.")

    def request(method, path, user, data=None):
        req = Request(args.url.rstrip("/") + path, method=method,
                      data=json.dumps(data).encode() if data is not None else None,
                      headers={"Content-Type": "application/json", "X-User-Id": str(user)})
        with urlopen(req, timeout=20) as response:
            return json.load(response)

    print(json.dumps({"created": seed(request), "friends": ["Kai", "Maya", "Leo"]}, indent=2))


if __name__ == "__main__":
    main()
