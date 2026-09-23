import React, { useEffect, useState } from "react";
import { Image, ScrollView, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { api, json, Media, mediaUploadURL, Person } from "./api";
import { AgentArt, Button, Header, styles } from "./ui";
import { colors as c } from "./theme";

export function AvatarCreator({
  me,
  back,
  saved,
}: {
  me: Person | null;
  back: () => void;
  saved: () => Promise<unknown>;
}) {
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState(false);
  useEffect(() => {
    api<{ configured: boolean }>("/agent/avatar/status")
      .then((r) => setConfigured(r.configured))
      .catch((e) => setError(String(e)));
  }, []);
  const choose = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.9,
      });
      if (result.canceled) return;
      if ((result.assets[0].fileSize || 0) > 10 * 1024 * 1024)
        throw new Error("Choose a photo smaller than 10 MB.");
      setPhoto(result.assets[0]);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const generate = async () => {
    if (!photo || busy) return;
    setBusy(true);
    setError("");
    setPhase("Uploading your photo…");
    try {
      const upload = await FileSystem.uploadAsync(mediaUploadURL, photo.uri, {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          "Content-Type": photo.mimeType || "image/jpeg",
          "X-User-Id": "1",
        },
      });
      const media = JSON.parse(upload.body) as Media & { detail?: string };
      if (upload.status >= 400)
        throw new Error(media.detail || "Photo upload failed.");
      setPhase("Creating your Aeolia character…");
      await api("/agent/avatar", json("POST", { photo_id: media.id }));
      await saved();
      setPhoto(null);
      setPhase("Your new agent is ready.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Header
        title="Change outfit"
        onBack={() => (busy ? undefined : back())}
      />
      <ScrollView contentContainerStyle={[styles.body, { gap: 18 }]}>
        <View
          style={{
            height: 280,
            borderRadius: 20,
            backgroundColor: c.soft,
            overflow: "hidden",
          }}
        >
          {photo ? (
            <Image
              source={{ uri: photo.uri }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="contain"
            />
          ) : (
            <AgentArt outfit={me?.outfit} uri={me?.avatar_url} />
          )}
        </View>
        <Text style={styles.heading}>Your face. Your agent.</Text>
        <Text style={styles.muted}>
          Choose a clear photo of yourself. We'll turn it into a friendly 3D
          character with soft lighting, a relaxed outfit and the Aeolia look.
        </Text>
        <Button
          label={photo ? "Choose another photo" : "Upload a photo"}
          icon="camera-outline"
          secondary
          disabled={busy}
          onPress={choose}
        />
        <Button
          label="Generate my agent"
          icon="sparkles-outline"
          loading={busy}
          disabled={!photo || !configured}
          onPress={generate}
        />
        {!configured && (
          <Text style={styles.muted}>
            The local image service isn't connected yet. Your current agent
            stays available.
          </Text>
        )}
        {!!phase && (
          <Text accessibilityLiveRegion="polite" style={styles.text}>
            {phase}
          </Text>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={{ color: c.rose }}>
            {error}
          </Text>
        )}
        <Text style={styles.muted}>
          Your source photo stays private. Your generated agent is visible on
          your profile and match cards.
        </Text>
      </ScrollView>
    </>
  );
}
