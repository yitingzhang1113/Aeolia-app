import random
from app.games.draw_guess import engine


def test_two_player_round_flow_and_secrecy():
    rng = random.Random(1)
    s = engine.new_game([1, 2], rounds_per_player=1, rng=rng)
    assert s["phase"] == "choosing" and s["drawer_id"] == 1 and len(s["word_options"]) == 3
    # Only the drawer chooses; others can't.
    try:
        engine.choose_word(s, 2, s["word_options"][0])
        assert False, "non-drawer chose a word"
    except ValueError:
        pass
    word = s["word_options"][0]
    engine.choose_word(s, 1, word)
    assert s["phase"] == "drawing" and s["word"] == word
    # Secrecy: guesser sees a mask, not the word or options.
    gv = engine.view(s, 2)
    expected_mask = "".join("_" if ch != " " else " " for ch in word)
    assert "word" not in gv and gv["hint"] == expected_mask and "word_options" not in gv
    assert engine.view(s, 1)["word"] == word  # drawer sees it
    # Wrong guess changes nothing; correct guess ends the (2P) round and scores both.
    assert engine.guess(s, 2, "definitely-wrong", 60) == (False, False)
    correct, over = engine.guess(s, 2, word.upper(), time_left=30)
    assert correct and over and s["phase"] == "round_end"
    assert s["scores"]["2"] == 50 and s["scores"]["1"] == engine.DRAWER_BONUS
    # 2 players × 1 round = 2 turns; drawer rotates to player 2 for the last turn.
    engine.next_turn(s, rng=rng)
    assert s["turn"] == 2 and s["drawer_id"] == 2 and s["phase"] == "choosing"
    word2 = s["word_options"][0]
    engine.choose_word(s, 2, word2)
    engine.guess(s, 1, word2, time_left=10)  # player 1 guesses → round_end
    engine.next_turn(s, rng=rng)
    assert s["phase"] == "finished" and s["winner_id"] == 2  # player 2 leads on points


def test_drawer_rotates_and_hint_reveals():
    rng = random.Random(2)
    s = engine.new_game([1, 2], rounds_per_player=2, rng=rng)  # 4 turns
    engine.choose_word(s, 1, s["word_options"][0])
    engine.reveal_hint(s)
    assert engine.view(s, 2)["hint"][0] == s["word"][0]  # first letter revealed
    engine.time_up(s)
    engine.next_turn(s, rng=rng)
    assert s["turn"] == 2 and s["drawer_id"] == 2 and s["phase"] == "choosing"


def test_group_round_needs_all_guessers():
    rng = random.Random(3)
    s = engine.new_game([1, 2, 3], rounds_per_player=1, rng=rng)  # drawer 1, guessers 2 & 3
    word = s["word_options"][0]
    engine.choose_word(s, 1, word)
    _, over = engine.guess(s, 2, word, time_left=60)
    assert not over and s["phase"] == "drawing"  # still waiting on player 3
    _, over = engine.guess(s, 3, word, time_left=40)
    assert over and s["phase"] == "round_end"
