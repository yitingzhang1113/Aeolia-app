import React, { useEffect, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { mediaSource } from "./api";
import { Icon, IconButton, styles } from "./ui";
import { colors as c } from "./theme";

const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// A photo sent in a conversation. Source carries the X-User-Id header via mediaSource.
export function ChatImageBubble({ url, mine }: { url: string; mine: boolean }) {
  return (
    <View
      style={[
        s.imageWrap,
        { alignSelf: mine ? "flex-end" : "flex-start" },
      ]}
    >
      <Image
        source={mediaSource(url)}
        accessibilityLabel="Photo message"
        style={s.image}
        resizeMode="cover"
      />
    </View>
  );
}

// A document attachment sent in a conversation.
export function FileBubble({
  name,
  mine,
  onPress,
}: {
  name: string;
  mine: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`File ${name}`}
      onPress={onPress}
      style={[
        s.file,
        mine ? s.mine : s.theirs,
        { alignSelf: mine ? "flex-end" : "flex-start" },
      ]}
    >
      <View style={s.fileIcon}>
        <Icon name="document-text-outline" size={22} color={c.teal} />
      </View>
      <Text style={[styles.text, { flexShrink: 1 }]} numberOfLines={1}>
        {name}
      </Text>
    </Pressable>
  );
}

// A game invite or meeting plan card sent inline in a conversation.
export function InviteBubble({
  kind,
  body,
  mine,
}: {
  kind: "game" | "meetup";
  body: string;
  mine: boolean;
}) {
  const game = kind === "game";
  return (
    <View
      style={[
        s.invite,
        mine ? s.mine : s.theirs,
        { alignSelf: mine ? "flex-end" : "flex-start" },
      ]}
    >
      <View style={s.fileIcon}>
        <Icon
          name={game ? "game-controller-outline" : "calendar-outline"}
          size={20}
          color={c.teal}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.heading}>
          {game ? "Game invite" : "Meeting plan"}
        </Text>
        <Text style={styles.text}>{body}</Text>
        <Text style={styles.muted}>Prototype · RSVP isn’t wired yet</Text>
      </View>
    </View>
  );
}

// A game invite card. The invitee sees "Join Game"; the host sees a waiting state.
export function InviteCard({
  gameLabel,
  who,
  mine,
  onOpen,
}: {
  gameLabel: string;
  who: string;
  mine: boolean;
  onOpen: () => void;
}) {
  return (
    <View
      style={[
        s.inviteCard,
        mine ? s.mine : s.theirs,
        { alignSelf: mine ? "flex-end" : "flex-start" },
      ]}
    >
      <View style={[s.fileIcon, { alignSelf: "center" }]}>
        <Icon name="game-controller" size={22} color={c.teal} />
      </View>
      <Text style={[styles.heading, { textAlign: "center" }]}>
        {mine ? `You invited ${who}` : `${who} invited you`}
      </Text>
      <Text style={[styles.muted, { textAlign: "center", marginBottom: 4 }]}>
        to play {gameLabel}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={mine ? "Open game room" : `Join ${gameLabel}`}
        onPress={onOpen}
        style={s.joinButton}
      >
        <Text style={s.joinText}>{mine ? "Open room" : "Join Game"}</Text>
      </Pressable>
    </View>
  );
}

// A voice message with play/pause and a progress track.
export function VoiceBubble({ url, mine }: { url: string; mine: boolean }) {
  const player = useAudioPlayer(mediaSource(url));
  const status = useAudioPlayerStatus(player);
  const total = status.duration || 0;
  const elapsed = status.currentTime || 0;
  const pct = total ? Math.min(1, elapsed / total) : 0;
  const toggle = () => {
    if (status.playing) {
      player.pause();
    } else {
      if (status.didJustFinish || (total && elapsed >= total)) player.seekTo(0);
      player.play();
    }
  };
  return (
    <View
      style={[
        s.voice,
        mine ? s.mine : s.theirs,
        { alignSelf: mine ? "flex-end" : "flex-start" },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={status.playing ? "Pause voice message" : "Play voice message"}
        onPress={toggle}
        hitSlop={8}
      >
        <Icon name={status.playing ? "pause-circle" : "play-circle"} size={30} color={c.teal} />
      </Pressable>
      <View style={s.track}>
        <View style={[s.fill, { width: `${pct * 100}%` }]} />
      </View>
      <Text style={styles.muted}>{clock(total ? total : elapsed)}</Text>
    </View>
  );
}

// Recording bar shown in place of the composer; sends the clip uri on stop.
export function VoiceRecorder({
  onDone,
  onCancel,
}: {
  onDone: (uri: string) => void;
  onCancel: () => void;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [error, setError] = useState("");
  const finished = useRef(false);
  useEffect(() => {
    (async () => {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError("Allow microphone access to record a voice message.");
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      if (!finished.current) recorder.record();
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      finished.current = true;
      recorder.stop().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const stop = async (send: boolean) => {
    if (finished.current) return;
    finished.current = true;
    try {
      await recorder.stop();
    } catch {
      // Ignore stop errors; fall through to cancel below.
    }
    const uri = recorder.uri;
    if (send && uri) onDone(uri);
    else onCancel();
  };
  if (error) {
    return (
      <View style={s.recorder}>
        <Text style={[styles.text, { color: c.rose, flex: 1 }]}>{error}</Text>
        <IconButton name="close" label="Cancel" onPress={() => stop(false)} />
      </View>
    );
  }
  return (
    <View style={s.recorder}>
      <IconButton name="trash-outline" label="Cancel recording" onPress={() => stop(false)} />
      <View style={s.recDot} />
      <Text style={[styles.text, { flex: 1 }]}>
        Recording · {clock((state.durationMillis || 0) / 1000)}
      </Text>
      <IconButton name="send" label="Send voice message" onPress={() => stop(true)} />
    </View>
  );
}

const s = StyleSheet.create({
  imageWrap: {
    maxWidth: "78%",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 12,
    backgroundColor: c.soft,
  },
  image: { width: 230, height: 230 },
  voice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 200,
    maxWidth: "88%",
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
  },
  mine: { backgroundColor: "#DDF0F0", borderBottomRightRadius: 5 },
  theirs: { backgroundColor: "#EEF1F2", borderBottomLeftRadius: 5 },
  file: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    maxWidth: "88%",
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
  },
  invite: {
    flexDirection: "row",
    gap: 10,
    maxWidth: "88%",
    padding: 13,
    borderRadius: 16,
    marginBottom: 12,
  },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.white,
    alignItems: "center",
    justifyContent: "center",
  },
  inviteCard: {
    width: 230,
    maxWidth: "88%",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    gap: 6,
    alignItems: "center",
  },
  joinButton: {
    marginTop: 6,
    alignSelf: "stretch",
    backgroundColor: c.teal,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
  },
  joinText: { color: c.white, fontWeight: "700", fontSize: 15 },
  track: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.line,
    overflow: "hidden",
  },
  fill: { height: 4, backgroundColor: c.teal },
  recorder: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: c.line,
    backgroundColor: c.bg,
  },
  recDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: c.rose },
});
