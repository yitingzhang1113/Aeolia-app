"""Authoritative Draw & Guess engine — N players (2..N), Skribbl/DoodleDash-style.

Pure functions over a JSON-serializable dict (stored in Redis). The client never
decides anything: the drawer's word and word options are stripped from other
players' views (see `view`). Turn loop:

  choosing (drawer picks 1 of 3)  →  drawing (others guess via chat)
  →  round_end (word revealed)     →  next turn / finished

Scoring (server-side): a correct guess earns points scaled by remaining time;
the drawer earns a bonus per correct guesser.
"""
from .words import three_options

DEFAULT_DURATION = 60
DRAWER_BONUS = 25


def new_game(players, rounds_per_player=3, rng=None, duration=DEFAULT_DURATION, options=None):
    import random as _random
    rng = rng or _random
    order = list(players)
    state = {
        "players": list(players),
        "order": order,
        "scores": {str(p): 0 for p in players},
        "rounds_per_player": rounds_per_player,
        "total_turns": len(order) * rounds_per_player,
        "turn": 1,
        "duration": duration,
        "phase": "choosing",
        "drawer_id": order[0],
        "word_options": options or three_options(rng),
        "word": None,
        "revealed": 0,
        "correct": {},        # {str(user_id): points} guessed this turn
        "winner_id": None,
        "version": 1,
    }
    return state


def _guessers(state):
    return [p for p in state["players"] if p != state["drawer_id"]]


def choose_word(state, drawer_id, word):
    if state["phase"] != "choosing" or drawer_id != state["drawer_id"]:
        raise ValueError("Not choosing / not the drawer")
    if word not in state["word_options"]:
        raise ValueError("Word not offered")
    state["phase"] = "drawing"
    state["word"] = word
    state["word_options"] = []
    state["revealed"] = 0
    state["correct"] = {}
    state["version"] += 1
    return state


def guess(state, guesser_id, text, time_left):
    """Returns (correct, round_over). Mutates state. Wrong guesses change nothing."""
    if state["phase"] != "drawing":
        return False, False
    if guesser_id == state["drawer_id"] or str(guesser_id) in state["correct"]:
        return False, False
    if (text or "").strip().lower() != (state["word"] or "").lower():
        return False, False
    points = max(10, round(100 * max(0, time_left) / state["duration"]))
    state["correct"][str(guesser_id)] = points
    state["scores"][str(guesser_id)] = state["scores"].get(str(guesser_id), 0) + points
    state["scores"][str(state["drawer_id"])] += DRAWER_BONUS
    state["version"] += 1
    round_over = len(state["correct"]) >= len(_guessers(state))
    if round_over:
        state["phase"] = "round_end"
        state["version"] += 1
    return True, round_over


def reveal_hint(state):
    if state["phase"] == "drawing" and state["word"]:
        letters = len(state["word"].replace(" ", ""))
        if state["revealed"] < letters - 1:
            state["revealed"] += 1
            state["version"] += 1
    return state


def time_up(state):
    if state["phase"] == "drawing":
        state["phase"] = "round_end"
        state["version"] += 1
    return state


def next_turn(state, rng=None, options=None):
    import random as _random
    rng = rng or _random
    if state["phase"] not in ("round_end",):
        return state
    if state["turn"] >= state["total_turns"]:
        state["phase"] = "finished"
        best = max(state["scores"].items(), key=lambda kv: kv[1])
        state["winner_id"] = int(best[0]) if best[1] > 0 else None
        state["version"] += 1
        return state
    state["turn"] += 1
    state["drawer_id"] = state["order"][(state["turn"] - 1) % len(state["order"])]
    state["phase"] = "choosing"
    state["word_options"] = options or three_options(rng)
    state["word"] = None
    state["revealed"] = 0
    state["correct"] = {}
    state["version"] += 1
    return state


def masked(word, revealed):
    out = []
    shown = 0
    for ch in word:
        if ch == " ":
            out.append(" ")
        elif shown < revealed:
            out.append(ch)
            shown += 1
        else:
            out.append("_")
            shown += 1
    return "".join(out)


def view(state, user_id):
    """Per-recipient view. Only the drawer sees the word / options while it's secret."""
    is_drawer = user_id == state["drawer_id"]
    reveal_word = state["phase"] in ("round_end", "finished")
    v = {
        "phase": state["phase"],
        "players": state["players"],
        "scores": state["scores"],
        "drawer_id": state["drawer_id"],
        "turn": state["turn"],
        "total_turns": state["total_turns"],
        "duration": state["duration"],
        "is_drawer": is_drawer,
        "correct": state["correct"],
        "winner_id": state["winner_id"],
        "version": state["version"],
    }
    if state["word"]:
        if is_drawer or reveal_word:
            v["word"] = state["word"]
        else:
            v["hint"] = masked(state["word"], state["revealed"])
            v["word_length"] = len(state["word"])
    if state["phase"] == "choosing" and is_drawer:
        v["word_options"] = state["word_options"]
    return v
