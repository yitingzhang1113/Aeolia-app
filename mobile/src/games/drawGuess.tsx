import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import {
  DrawGuessState,
  DrawStroke,
  Person,
  api,
  gameSocketURL,
  json,
  mediaSource,
} from "../api";
import { Button, Field, Icon, IconButton, styles } from "../ui";
import { colors as c } from "../theme";
import { uploadMedia } from "../media";
import { VoiceRecorder } from "../chatmedia";

const EMOJIS = ["😊", "😂", "❤️", "👍", "🎉", "🔥", "😅", "🤔", "👀", "✨", "🙌", "😮"];
const PALETTE = ["#173343", "#B54C3C", "#E08A3C", "#E0B93C", "#2E9E5B", "#0E656C", "#5B57B5", "#8B5E3C"];

type ChatLine = {
  id: string;
  user_id: number;
  body: string;
  system?: boolean;
  media_url?: string;
};
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const STROKE_COLOR = "#173343";
const STROKE_WIDTH = 4;

function useGameSocket(roomId: number, userId: number) {
  const [state, setState] = useState<DrawGuessState | null>(null);
  const [strokes, setStrokes] = useState<DrawStroke[]>([]);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [connected, setConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const alive = useRef(true);
  const connect = useCallback(() => {
    const socket = new WebSocket(gameSocketURL(roomId, userId));
    ws.current = socket;
    socket.onopen = () => {
      setConnected(true);
      socket.send(JSON.stringify({ type: "resume" }));
    };
    socket.onmessage = (e) => {
      const m = JSON.parse(e.data as string);
      if (m.type === "snapshot") {
        setState(m.state);
        setStrokes(m.strokes || []);
      } else if (m.type === "state") {
        setState(m.state);
        if (m.state?.phase === "choosing") setStrokes([]);
      } else if (m.type === "stroke") {
        setStrokes((s) => [...s, m.stroke]);
      } else if (m.type === "clear") {
        setStrokes([]);
      } else if (m.type === "chat") {
        setChat((cl) => [...cl, { id: uid(), user_id: m.user_id, body: m.body }]);
      } else if (m.type === "system" && m.event === "guessed") {
        setChat((cl) => [
          ...cl,
          { id: uid(), user_id: m.user_id, body: "guessed the word! ✨", system: true },
        ]);
      } else if (m.type === "voice") {
        setChat((cl) => [
          ...cl,
          { id: uid(), user_id: m.user_id, body: "", media_url: m.media_url },
        ]);
      }
    };
    socket.onclose = () => {
      setConnected(false);
      if (alive.current) setTimeout(connect, 1500);
    };
    socket.onerror = () => socket.close();
  }, [roomId, userId]);
  useEffect(() => {
    alive.current = true;
    connect();
    return () => {
      alive.current = false;
      ws.current?.close();
    };
  }, [connect]);
  const send = useCallback((msg: object) => {
    if (ws.current && ws.current.readyState === 1)
      ws.current.send(JSON.stringify(msg));
  }, []);
  return { state, strokes, setStrokes, chat, setChat, connected, send };
}

function MiniVoice({ url }: { url: string }) {
  const player = useAudioPlayer(mediaSource(url));
  const status = useAudioPlayerStatus(player);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Play voice message"
      onPress={() => {
        if (status.playing) player.pause();
        else {
          if (status.didJustFinish) player.seekTo(0);
          player.play();
        }
      }}
      style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
    >
      <Icon name={status.playing ? "pause-circle" : "play-circle"} size={20} color={c.teal} />
      <Text style={styles.muted}>Voice message</Text>
    </Pressable>
  );
}

function Canvas({
  strokes,
  drawing,
  color,
  onStroke,
}: {
  strokes: DrawStroke[];
  drawing: boolean;
  color: string;
  onStroke: (s: DrawStroke) => void;
}) {
  const [size, setSize] = useState(0);
  const current = useRef<[number, number][]>([]);
  const [live, setLive] = useState<[number, number][]>([]);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => drawing,
        onMoveShouldSetPanResponder: () => drawing,
        onPanResponderMove: (e) => {
          if (!size) return;
          const { locationX, locationY } = e.nativeEvent;
          const p: [number, number] = [
            Math.max(0, Math.min(1, locationX / size)),
            Math.max(0, Math.min(1, locationY / size)),
          ];
          current.current.push(p);
          setLive([...current.current]);
        },
        onPanResponderRelease: () => {
          if (current.current.length > 1)
            onStroke({ points: current.current, color, width: STROKE_WIDTH });
          current.current = [];
          setLive([]);
        },
      }),
    [drawing, size, color, onStroke],
  );
  const toPoints = (pts: [number, number][]) =>
    pts.map(([x, y]) => `${x * size},${y * size}`).join(" ");
  return (
    <View
      onLayout={(e) => setSize(e.nativeEvent.layout.width)}
      style={s.canvas}
      {...(drawing ? pan.panHandlers : {})}
    >
      {size > 0 && (
        <Svg width={size} height={size}>
          {strokes.map((st, i) => (
            <Polyline
              key={i}
              points={toPoints(st.points)}
              fill="none"
              stroke={st.color || STROKE_COLOR}
              strokeWidth={st.width || STROKE_WIDTH}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {live.length > 1 && (
            <Polyline
              points={toPoints(live)}
              fill="none"
              stroke={color}
              strokeWidth={STROKE_WIDTH}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
        </Svg>
      )}
    </View>
  );
}

export function DrawGame({
  roomId,
  me,
  host,
  guest,
}: {
  roomId: number;
  me: Person | null;
  host: Person;
  guest: Person;
}) {
  const myId = me?.id ?? 0;
  const { state, strokes, setStrokes, chat, setChat, connected, send } =
    useGameSocket(roomId, myId);
  const [guess, setGuess] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [color, setColor] = useState(PALETTE[0]);
  const [emoji, setEmoji] = useState(false);
  const [recording, setRecording] = useState(false);
  const [roundsEach, setRoundsEach] = useState(3);
  const other = myId === host.id ? guest : host;
  const startGame = () => send({ type: "start", rounds_per_player: roundsEach });
  const nameOf = (id: number) => (id === host.id ? host.name : guest.name);
  const sendChat = () => {
    const body = guess.trim();
    if (!body) return;
    send({ type: "chat", body });
    setChat((cl) => [...cl, { id: uid(), user_id: myId, body }]);
    setGuess("");
  };
  const sendVoice = async (uri: string) => {
    try {
      const media = await uploadMedia(uri, "audio/mp4");
      await api(
        "/messages",
        json("POST", { recipient_id: other.id, kind: "voice", media_id: media.id }),
      );
      send({ type: "voice", media_url: media.url });
      setChat((cl) => [...cl, { id: uid(), user_id: myId, body: "", media_url: media.url }]);
    } catch {
      // Upload/relay failure is non-fatal for the game.
    }
  };

  // Local drawing-phase countdown; the drawer reports time-up to the server.
  useEffect(() => {
    if (state?.phase !== "drawing") {
      setSeconds(0);
      return;
    }
    setSeconds(state.duration);
    const t = setInterval(() => {
      setSeconds((n) => {
        if (n <= 1) {
          clearInterval(t);
          if (state.is_drawer) send({ type: "time_up" });
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [state?.phase, state?.turn]);

  if (!state)
    return (
      <View style={s.center}>
        <Icon name="brush-outline" size={42} color={c.muted} />
        <Text style={styles.heading}>Draw & Guess</Text>
        <Text style={[styles.muted, { textAlign: "center" }]}>
          Take turns drawing a word while the other guesses.
        </Text>
        <Text style={styles.muted}>Rounds each</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[1, 3, 5].map((n) => (
            <Pressable
              key={n}
              accessibilityRole="button"
              accessibilityState={{ selected: roundsEach === n }}
              onPress={() => setRoundsEach(n)}
              style={[s.roundPill, roundsEach === n && s.roundPillActive]}
            >
              <Text style={roundsEach === n ? s.roundPillTextActive : s.roundPillText}>
                {n}
              </Text>
            </Pressable>
          ))}
        </View>
        <Button
          label={connected ? "Start game" : "Connecting…"}
          disabled={!connected}
          onPress={startGame}
        />
      </View>
    );

  if (state.phase === "finished") {
    const winner = state.winner_id;
    return (
      <View style={s.center}>
        <Text style={{ fontSize: 40 }}>✨</Text>
        <Text style={styles.title}>
          {winner ? `${nameOf(winner)} won!` : "Good game!"}
        </Text>
        {state.players.map((p) => (
          <Text key={p} style={styles.text}>
            {nameOf(p)} · {state.scores[String(p)] || 0}
          </Text>
        ))}
        <Button label="Play again" onPress={startGame} />
      </View>
    );
  }

  const drawerName = nameOf(state.drawer_id);
  return (
    <View style={{ flex: 1 }}>
      <View style={s.statusBar}>
        <Text style={styles.muted}>
          Turn {state.turn}/{state.total_turns}
        </Text>
        {state.phase === "drawing" && (
          <Text style={[ui.rowTitle]}>{seconds}s</Text>
        )}
        <Text style={styles.muted}>
          {nameOf(host.id)} {state.scores[String(host.id)] || 0} · {nameOf(guest.id)}{" "}
          {state.scores[String(guest.id)] || 0}
        </Text>
      </View>

      <View style={s.wordRow}>
        {state.phase === "round_end" ? (
          <Text style={ui.rowTitle}>The word was {state.word?.toUpperCase()}</Text>
        ) : state.phase === "choosing" ? (
          state.is_drawer ? (
            <View style={{ alignItems: "center", gap: 8 }}>
              <Text style={styles.muted}>Pick a word to draw</Text>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                {(state.word_options || []).map((w) => (
                  <Pressable
                    key={w}
                    accessibilityRole="button"
                    onPress={() => send({ type: "choose", word: w })}
                    style={s.wordChip}
                  >
                    <Text style={s.wordChipText}>{w}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <Text style={styles.muted}>{drawerName} is choosing a word…</Text>
          )
        ) : state.is_drawer ? (
          <Text style={ui.rowTitle}>Draw: {state.word?.toUpperCase()}</Text>
        ) : (
          <Text style={s.hint}>
            {(state.hint || "").split("").join(" ").toUpperCase()}
          </Text>
        )}
      </View>

      <Canvas
        strokes={strokes}
        drawing={state.phase === "drawing" && state.is_drawer}
        color={color}
        onStroke={(st) => {
          setStrokes((prev) => [...prev, st]);
          send({ type: "stroke", stroke: st });
        }}
      />

      {state.phase === "drawing" && state.is_drawer && (
        <View style={s.tools}>
          {PALETTE.map((col) => (
            <Pressable
              key={col}
              accessibilityRole="button"
              accessibilityLabel={`Brush color ${col}`}
              accessibilityState={{ selected: color === col }}
              onPress={() => setColor(col)}
              style={[
                s.swatch,
                { backgroundColor: col },
                color === col && s.swatchActive,
              ]}
            />
          ))}
          <IconButton
            name="trash-outline"
            label="Clear canvas"
            onPress={() => {
              setStrokes([]);
              send({ type: "clear" });
            }}
          />
        </View>
      )}
      {state.phase === "round_end" && (
        <View style={{ alignItems: "center", paddingVertical: 6 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next round"
            onPress={() => send({ type: "next" })}
            style={s.nextPill}
          >
            <Text style={s.nextPillText}>Next round</Text>
            <Icon name="arrow-forward" size={15} color={c.white} />
          </Pressable>
        </View>
      )}

      <ScrollView style={{ maxHeight: 110 }} contentContainerStyle={{ paddingVertical: 6, gap: 4, paddingHorizontal: 14 }}>
        {chat.slice(-12).map((l) =>
          l.media_url ? (
            <View key={l.id} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={styles.muted}>{nameOf(l.user_id)}:</Text>
              <MiniVoice url={l.media_url} />
            </View>
          ) : (
            <Text key={l.id} style={l.system ? s.systemLine : styles.muted} numberOfLines={1}>
              {l.system
                ? `✨ ${nameOf(l.user_id)} ${l.body}`
                : `${nameOf(l.user_id)}: ${l.body}`}
            </Text>
          ),
        )}
      </ScrollView>

      {recording ? (
        <VoiceRecorder
          onCancel={() => setRecording(false)}
          onDone={(uri) => {
            setRecording(false);
            sendVoice(uri);
          }}
        />
      ) : (
        <>
          {emoji && (
            <View style={s.emojiRow}>
              {EMOJIS.map((e) => (
                <Pressable
                  key={e}
                  accessibilityRole="button"
                  accessibilityLabel={`Insert ${e}`}
                  onPress={() => setGuess((g) => g + e)}
                  style={s.emojiKey}
                >
                  <Text style={{ fontSize: 24 }}>{e}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <View style={ui.composerRow}>
            <IconButton
              name="mic-outline"
              label="Record voice message"
              onPress={() => {
                setEmoji(false);
                setRecording(true);
              }}
            />
            <Field
              value={guess}
              onChangeText={setGuess}
              placeholder={
                !state.is_drawer && state.phase === "drawing"
                  ? "Type your guess…"
                  : "Say something…"
              }
              style={ui.guessInput}
              autoCapitalize="none"
              onSubmitEditing={sendChat}
            />
            <IconButton
              name="happy-outline"
              label="Emoji"
              onPress={() => setEmoji((v) => !v)}
            />
            <IconButton
              name="send"
              label="Send"
              disabled={!guess.trim()}
              onPress={sendChat}
            />
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 30 },
  statusBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  wordRow: { alignItems: "center", paddingVertical: 8, minHeight: 44 },
  hint: { fontSize: 22, letterSpacing: 2, fontWeight: "700", color: c.ink },
  canvas: {
    alignSelf: "center",
    width: "92%",
    aspectRatio: 1,
    backgroundColor: c.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.line,
    overflow: "hidden",
  },
  tools: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "transparent",
  },
  swatchActive: { borderColor: c.ink },
  emojiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#F3F5F3",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  emojiKey: { width: "16.6%", alignItems: "center", paddingVertical: 6 },
  wordChip: {
    backgroundColor: c.mint,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  wordChipText: { color: c.teal, fontWeight: "700", fontSize: 15 },
  roundPill: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: c.line,
    alignItems: "center",
    justifyContent: "center",
  },
  roundPillActive: { backgroundColor: c.teal, borderColor: c.teal },
  roundPillText: { color: c.ink, fontWeight: "700", fontSize: 16 },
  roundPillTextActive: { color: c.white, fontWeight: "700", fontSize: 16 },
  nextPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: c.teal,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  nextPillText: { color: c.white, fontWeight: "700", fontSize: 14 },
  systemLine: { color: c.teal, fontSize: 13, fontWeight: "600" },
});
const ui = StyleSheet.create({
  rowTitle: { color: c.ink, fontSize: 15, fontWeight: "700" },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: c.line,
  },
  guessInput: {
    flex: 1,
    marginBottom: 0,
    borderRadius: 22,
    backgroundColor: c.white,
  },
});
