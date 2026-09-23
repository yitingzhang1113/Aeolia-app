import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as VideoThumbnails from "expo-video-thumbnails";
import * as FileSystem from "expo-file-system/legacy";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent } from "expo";
import { api, Circle, json, Media, mediaSource, mediaUploadURL } from "./api";
import { Button, Field, Header, Icon, IconButton, Pill, styles } from "./ui";
import { colors as c } from "./theme";

export function VideoPreview({
  uri,
  cover,
}: {
  uri: string;
  cover?: string | null;
}) {
  const player = useVideoPlayer(mediaSource(uri), (p) => {
    p.loop = false;
  });
  const status = useEvent(player, "statusChange", { status: player.status });
  const playing = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });
  const [started, setStarted] = useState(false);
  return (
    <View style={s.video}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls
        allowsFullscreen
      />
      {!!cover && !started && !playing.isPlaying && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Play video"
          onPress={() => {
            setStarted(true);
            player.play();
          }}
          style={StyleSheet.absoluteFill}
        >
          <Image
            source={mediaSource(cover)}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
          />
          <View style={s.play}>
            <Icon name="play" size={28} color={c.white} />
          </View>
        </Pressable>
      )}
      {status.status === "error" && (
        <View style={s.videoError}>
          <Text style={{ color: c.white }}>Couldn't play this video.</Text>
          <Button
            label="Retry playback"
            onPress={() => {
              player.replaceAsync(mediaSource(uri)).catch(() => {});
              setStarted(false);
            }}
            secondary
          />
        </View>
      )}
    </View>
  );
}
export function MediaCarousel({
  items,
  cover,
}: {
  items: Media[];
  cover?: string | null;
}) {
  const [active, setActive] = useState(0);
  const [width, setWidth] = useState(0);
  if (!items.length) return null;
  if (items[0].kind === "video")
    return <VideoPreview uri={items[0].url} cover={cover} />;
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ marginTop: 12 }}
    >
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          if (width)
            setActive(Math.round(e.nativeEvent.contentOffset.x / width));
        }}
      >
        {items.map((item, i) => (
          <Image
            key={item.id}
            source={mediaSource(item.url)}
            accessibilityLabel={`Photo ${i + 1} of ${items.length}`}
            resizeMode="contain"
            style={{
              width: width || 300,
              height: width || 300,
              backgroundColor: c.soft,
              borderRadius: 12,
            }}
          />
        ))}
      </ScrollView>
      {items.length > 1 && (
        <View style={s.pagination}>
          {items.map((item, i) => (
            <View
              key={item.id}
              style={[s.dot, i === active && { backgroundColor: c.teal }]}
            />
          ))}
          <Text style={styles.muted}>
            {active + 1}/{items.length}
          </Text>
        </View>
      )}
    </View>
  );
}

type Picked = ImagePicker.ImagePickerAsset;
export function MediaComposer({
  kind,
  circle,
  onBack,
  onCreated,
}: {
  kind: "post" | "video";
  circle: Circle | null;
  onBack: () => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState(1);
  const [assets, setAssets] = useState<Picked[]>([]);
  const [active, setActive] = useState(0);
  const [caption, setCaption] = useState("");
  const [audience, setAudience] = useState<"friends" | "public">(
    circle ? "public" : "friends",
  );
  const [frames, setFrames] = useState<string[]>([]);
  const [cover, setCover] = useState("");
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const uploaded = useRef(new Map<string, Media>());
  const task = useRef<FileSystem.UploadTask | null>(null);
  const alive = useRef(true);
  const requestId = useRef(
    `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const isVideo = kind === "video";
  const selected = assets[active];
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      task.current?.cancelAsync();
    };
  }, []);
  const close = () => {
    if (busy) return;
    if (!assets.length && !caption) {
      onBack();
      return;
    }
    Alert.alert(
      "Discard this draft?",
      "Your selected media and caption will be cleared.",
      [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: onBack },
      ],
    );
  };
  const pick = async () => {
    if (busy || picking) return;
    setPicking(true);
    setError("");
    try {
      if (isVideo) {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            "Photo access needed",
            "Allow access to choose a video.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: () => Linking.openSettings() },
            ],
          );
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: isVideo ? ["videos"] : ["images"],
        allowsMultipleSelection: !isVideo,
        selectionLimit: 10,
        orderedSelection: true,
        allowsEditing: isVideo,
        videoMaxDuration: 60,
        quality: 0.9,
      });
      if (result.canceled) return;
      const next = result.assets.slice(0, isVideo ? 1 : 10);
      if (next.some((a) => (a.fileSize || 0) > 64 * 1024 * 1024))
        throw new Error(
          "Choose files smaller than 64 MB each. Try a shorter video.",
        );
      setAssets(next);
      setActive(0);
      setFrames([]);
      setCover("");
      if (isVideo) {
        const duration = next[0].duration || 1000;
        const thumbnails = await Promise.all(
          [0, 0.25, 0.5, 0.75, 0.95].map((f) =>
            VideoThumbnails.getThumbnailAsync(next[0].uri, {
              time: Math.round(duration * f),
              quality: 0.7,
            })
              .then((x) => x.uri)
              .catch(() => null),
          ),
        );
        const good = thumbnails.filter((x): x is string => !!x);
        setFrames(good);
        setCover(good[0] || "");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPicking(false);
    }
  };
  const move = (direction: number) => {
    const destination = active + direction;
    if (destination < 0 || destination >= assets.length) return;
    setAssets((items) => {
      const next = [...items];
      [next[active], next[destination]] = [next[destination], next[active]];
      return next;
    });
    setActive(destination);
  };
  const upload = async (
    uri: string,
    mime: string,
    part: number,
    total: number,
  ): Promise<Media> => {
    const cached = uploaded.current.get(uri);
    if (cached) {
      setProgress((part + 1) / total);
      return cached;
    }
    const uploadTask = FileSystem.createUploadTask(
      mediaUploadURL,
      uri,
      {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": mime, "X-User-Id": "1" },
      },
      (p) => {
        if (alive.current)
          setProgress(
            (part +
              p.totalBytesSent / Math.max(1, p.totalBytesExpectedToSend)) /
              total,
          );
      },
    );
    task.current = uploadTask;
    const timer = setTimeout(() => {
      uploadTask.cancelAsync();
    }, 120000);
    try {
      const result = await uploadTask.uploadAsync();
      if (!result)
        throw new Error(
          "Upload was interrupted. Your draft is saved on this screen.",
        );
      let data;
      try {
        data = JSON.parse(result.body);
      } catch {
        throw new Error("Upload failed. Please try again.");
      }
      if (result.status >= 400) throw new Error(data.detail || "Upload failed");
      uploaded.current.set(uri, data);
      return data;
    } finally {
      clearTimeout(timer);
      task.current = null;
    }
  };
  const publish = async () => {
    if (busy || (!assets.length && !caption.trim())) return;
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      const media: Media[] = [];
      const total = assets.length + (cover ? 1 : 0);
      for (let i = 0; i < assets.length; i++) {
        const a = assets[i];
        const extension = a.uri.split(".").pop()?.toLowerCase();
        const fallback =
          extension === "png"
            ? "image/png"
            : extension === "heic"
              ? "image/heic"
              : extension === "mov"
                ? "video/quicktime"
                : isVideo
                  ? "video/mp4"
                  : "image/jpeg";
        media.push(await upload(a.uri, a.mimeType || fallback, i, total));
      }
      const coverMedia = cover
        ? await upload(cover, "image/jpeg", assets.length, total)
        : null;
      await api(
        "/posts",
        json("POST", {
          body: caption.trim(),
          visibility: audience,
          circle_id: audience === "public" ? circle?.id || null : null,
          media_ids: media.map((m) => m.id),
          cover_media_id: coverMedia?.id || null,
          request_id: requestId.current,
        }),
      );
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <>
      <Header
        title={isVideo ? "New video" : "New post"}
        onBack={() => (busy ? undefined : step === 2 ? setStep(1) : close())}
        right={
          <Pressable
            accessibilityRole="button"
            disabled={
              busy ||
              picking ||
              (step === 1 ? !assets.length : !assets.length && !caption.trim())
            }
            onPress={step === 1 ? () => setStep(2) : publish}
            style={s.headerAction}
          >
            <Text
              style={[
                s.actionText,
                (busy ||
                  picking ||
                  (step === 1
                    ? !assets.length
                    : !assets.length && !caption.trim())) && { opacity: 0.35 },
              ]}
            >
              {busy ? "Sharing…" : step === 1 ? "Next" : "Share"}
            </Text>
          </Pressable>
        }
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.body}
      >
        {selected && step === 1 ? (
          <>
            {isVideo ? (
              <VideoPreview key={selected.uri} uri={selected.uri} />
            ) : (
              <Image
                source={{ uri: selected.uri }}
                resizeMode="contain"
                accessibilityLabel={`Selected photo ${active + 1}`}
                style={s.preview}
              />
            )}
            <View style={s.selectionInfo}>
              <Text style={styles.muted}>
                {isVideo
                  ? `${Math.round((selected.duration || 0) / 1000)} sec`
                  : `${active + 1} / ${assets.length} selected`}
              </Text>
              <Text style={styles.muted}>
                {(
                  assets.reduce((n, a) => n + (a.fileSize || 0), 0) /
                  1024 /
                  1024
                ).toFixed(1)}{" "}
                MB
              </Text>
            </View>
          </>
        ) : step === 1 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isVideo ? "Choose video" : "Choose photos"}
            onPress={pick}
            style={s.emptyPicker}
          >
            <Icon
              name={isVideo ? "videocam-outline" : "images-outline"}
              size={46}
            />
            <Text style={styles.heading}>
              {isVideo ? "Choose a video" : "Choose your moments"}
            </Text>
            <Text style={styles.muted}>
              {isVideo
                ? "Select a clip and trim it in the iOS editor."
                : "Select up to 10 photos, in the order you want."}
            </Text>
          </Pressable>
        ) : null}
        {step === 1 ? (
          <>
            <View style={s.libraryBar}>
              <Pressable
                accessibilityRole="button"
                disabled={picking}
                onPress={pick}
                style={s.libraryLink}
              >
                <Text style={styles.heading}>Photo library</Text>
                <Icon name="chevron-down" size={16} />
              </Pressable>
              <Icon
                name={isVideo ? "film-outline" : "copy-outline"}
                size={20}
              />
            </View>
            {!isVideo && assets.length > 0 && (
              <>
                <View style={s.photoGrid}>
                  {assets.map((a, i) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Select photo ${i + 1}`}
                      accessibilityState={{ selected: active === i }}
                      key={a.uri}
                      onPress={() => setActive(i)}
                      style={[
                        s.photoTile,
                        active === i && { borderColor: c.teal },
                      ]}
                    >
                      <Image
                        source={{ uri: a.uri }}
                        style={StyleSheet.absoluteFill}
                      />
                      <View style={s.number}>
                        <Text style={{ color: c.white, fontSize: 11 }}>
                          {i + 1}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
                <View style={s.tools}>
                  <Button
                    label="Move left"
                    secondary
                    disabled={active === 0}
                    onPress={() => move(-1)}
                  />
                  <Button
                    label="Move right"
                    secondary
                    disabled={active === assets.length - 1}
                    onPress={() => move(1)}
                  />
                  <IconButton
                    name="trash-outline"
                    label="Remove selected photo"
                    onPress={() => {
                      setAssets((a) => a.filter((_, i) => i !== active));
                      setActive(Math.max(0, active - 1));
                    }}
                  />
                </View>
              </>
            )}
            <View style={{ gap: 12, marginTop: 20 }}>
              <Button
                label={
                  picking
                    ? "Opening library…"
                    : assets.length
                      ? isVideo
                        ? "Choose / trim another video"
                        : "Change photos"
                      : isVideo
                        ? "Select video"
                        : "Select photos"
                }
                icon={isVideo ? "videocam-outline" : "images-outline"}
                secondary
                loading={picking}
                onPress={pick}
              />

              {!isVideo && (
                <Button
                  label="Write a text post instead"
                  secondary
                  onPress={() => {
                    setAssets([]);
                    setStep(2);
                  }}
                />
              )}
            </View>
          </>
        ) : (
          <>
            <View style={s.captionRow}>
              {selected && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit selected media"
                  disabled={busy}
                  onPress={() => setStep(1)}
                >
                  <View style={s.shareThumbnail}>
                    {!isVideo || cover ? (
                      <Image
                        source={{ uri: isVideo ? cover : selected.uri }}
                        style={StyleSheet.absoluteFill}
                      />
                    ) : (
                      <Icon name="videocam-outline" size={30} />
                    )}
                    {assets.length > 1 && (
                      <View style={s.number}>
                        <Icon name="copy-outline" color={c.white} size={14} />
                      </View>
                    )}
                  </View>
                </Pressable>
              )}
              <Field
                value={caption}
                onChangeText={setCaption}
                editable={!busy}
                placeholder="Write a caption…"
                multiline
                maxLength={2200}
                style={s.captionInput}
              />
            </View>
            <Text style={[styles.muted, { textAlign: "right" }]}>
              {caption.length} / 2,200
            </Text>
            {isVideo && frames.length > 0 && (
              <>
                <Text style={[styles.heading, { marginTop: 16 }]}>
                  Choose cover
                </Text>
                <ScrollView horizontal contentContainerStyle={s.thumbnails}>
                  {frames.map((uri, i) => (
                    <Pressable
                      key={uri}
                      accessibilityRole="button"
                      accessibilityLabel={`Cover frame ${i + 1}`}
                      accessibilityState={{ selected: cover === uri }}
                      disabled={busy}
                      onPress={() => setCover(uri)}
                      style={[
                        s.thumbnail,
                        cover === uri && { borderColor: c.teal },
                      ]}
                    >
                      <Image
                        source={{ uri }}
                        style={{ width: 64, height: 80 }}
                      />
                      {cover === uri && (
                        <View style={s.number}>
                          <Icon name="checkmark" size={14} color={c.white} />
                        </View>
                      )}
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}
            {!isVideo && assets.length > 1 && (
              <Text style={[styles.muted, { marginBottom: 12 }]}>
                {assets.length} photos · swipe through them after publishing
              </Text>
            )}
            <Text style={[styles.heading, { marginVertical: 16 }]}>
              Audience
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pill
                label="Friends"
                active={audience === "friends"}
                onPress={busy ? undefined : () => setAudience("friends")}
              />
              <Pill
                label="Public"
                active={audience === "public"}
                onPress={busy ? undefined : () => setAudience("public")}
              />
            </View>
            <Text style={[styles.muted, { marginTop: 10, marginBottom: 24 }]}>
              {audience === "friends"
                ? "Only people who follow you back can see this post."
                : circle
                  ? `Public in ${circle.name}.`
                  : "Anyone can see this post."}
            </Text>
            {busy && (
              <View
                accessibilityRole="progressbar"
                accessibilityValue={{
                  min: 0,
                  max: 100,
                  now: Math.round(progress * 100),
                }}
                style={{ marginBottom: 16, gap: 8 }}
              >
                <View style={s.progressTrack}>
                  <View
                    style={{
                      height: 5,
                      width: `${progress * 100}%`,
                      backgroundColor: c.teal,
                    }}
                  />
                </View>
                <Text style={styles.muted}>
                  {progress < 1
                    ? `Uploading · ${Math.round(progress * 100)}%`
                    : "Publishing your post…"}
                </Text>
              </View>
            )}
            <Button
              label={error ? "Retry sharing" : "Share post"}
              loading={busy}
              disabled={!assets.length && !caption.trim()}
              onPress={publish}
            />
          </>
        )}
        {!!error && (
          <Text
            accessibilityRole="alert"
            style={[styles.text, { color: c.rose, marginTop: 16 }]}
          >
            {error} Your caption and selection are still here.
          </Text>
        )}
      </ScrollView>
    </>
  );
}
const s = StyleSheet.create({
  headerAction: {
    minWidth: 60,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  actionText: { color: c.teal, fontWeight: "700", fontSize: 16 },
  captionRow: {
    flexDirection: "row",
    gap: 16,
    paddingVertical: 16,
    alignItems: "flex-start",
  },
  shareThumbnail: {
    width: 84,
    height: 108,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: c.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  captionInput: {
    flex: 1,
    minHeight: 108,
    textAlignVertical: "top",
    borderWidth: 0,
    backgroundColor: "transparent",
    padding: 0,
  },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 3 },
  photoTile: {
    width: "24%",
    aspectRatio: 1,
    borderWidth: 2,
    borderColor: "transparent",
    overflow: "hidden",
  },
  libraryBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  libraryLink: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    minHeight: 44,
  },
  video: {
    height: 320,
    backgroundColor: "#17282D",
    borderRadius: 14,
    overflow: "hidden",
    marginTop: 12,
  },
  videoError: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#173343",
    gap: 12,
  },
  play: {
    position: "absolute",
    top: "43%",
    left: "43%",
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(0,0,0,.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingTop: 10,
  },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: c.line },
  steps: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  step: { fontSize: 12, fontWeight: "600", color: c.muted },
  preview: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: c.soft,
    borderRadius: 14,
  },
  emptyPicker: {
    minHeight: 300,
    borderRadius: 16,
    backgroundColor: c.soft,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    gap: 16,
  },
  selectionInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  thumbnails: { flexDirection: "row", gap: 8, paddingVertical: 12 },
  thumbnail: {
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: 10,
    overflow: "hidden",
    padding: 2,
  },
  number: {
    position: "absolute",
    right: 4,
    top: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: c.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  tools: { flexDirection: "row", gap: 8, justifyContent: "space-between" },
  progressTrack: {
    height: 5,
    backgroundColor: c.line,
    borderRadius: 3,
    overflow: "hidden",
  },
});
