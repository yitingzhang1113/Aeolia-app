import React, { useState } from "react";
import { Alert, Linking, ScrollView, Text, View } from "react-native";
import { api, json, Person } from "./api";
import { Button, Field, Header, Pill, Section, styles } from "./ui";
import { colors as c } from "./theme";

export function ProfileExtras({ person }: { person: Person }) {
  const p = person.profile || {};
  return (
    <View style={{ gap: 18, marginTop: 18 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {!!person.age && <Pill label={`${person.age} years old`} />}
        {!!person.height_cm && <Pill label={`${person.height_cm} cm`} />}
        <Pill
          label={
            person.intent === "dating" ? "Open to dating" : "Making friends"
          }
        />
      </View>
      {!!p.looking_for && (
        <Section title="I'm looking for">
          <Text style={styles.text}>{p.looking_for}</Text>
        </Section>
      )}
      {!!p.school && <Text style={styles.muted}>{p.school}</Text>}
      {!!p.languages?.length && (
        <Text style={styles.text}>Languages · {p.languages.join(", ")}</Text>
      )}
      {!!p.lifestyle?.length && (
        <Section title="A little about me">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {p.lifestyle.map((tag) => (
              <Pill key={tag} label={tag} />
            ))}
          </View>
        </Section>
      )}
      {p.prompts
        ?.filter((answer) => answer.answer)
        .map((answer) => (
          <View
            key={answer.question}
            style={[styles.card, { backgroundColor: c.apricot, gap: 10 }]}
          >
            <Text style={styles.muted}>{answer.question}</Text>
            <Text style={styles.heading}>{answer.answer}</Text>
          </View>
        ))}
      {!!(p.music_artists?.length || p.music_genres?.length || p.music_url) && (
        <Section title="My music taste">
          {!!p.music_artists?.length && (
            <Text style={[styles.heading, { marginBottom: 8 }]}>
              {p.music_artists.join(" · ")}
            </Text>
          )}
          {!!p.music_genres?.length && (
            <Text style={[styles.muted, { marginBottom: 12 }]}>
              {p.music_genres.join(" · ")}
            </Text>
          )}
          {!!p.music_url && (
            <Button
              label="Listen to my music"
              icon="musical-notes-outline"
              secondary
              onPress={() =>
                Linking.openURL(p.music_url!).catch(() =>
                  Alert.alert("Couldn't open this music link"),
                )
              }
            />
          )}
        </Section>
      )}
    </View>
  );
}

export function ProfileEditor({
  person,
  back,
  saved,
}: {
  person: Person;
  back: () => void;
  saved: () => Promise<unknown>;
}) {
  const p = person.profile || {};
  const [name, setName] = useState(person.name);
  const [age, setAge] = useState(person.age?.toString() || "");
  const [height, setHeight] = useState(person.height_cm?.toString() || "");
  const [intent, setIntent] = useState(person.intent || "friendship");
  const [lookingFor, setLookingFor] = useState(p.looking_for || "");
  const [bio, setBio] = useState(person.bio);
  const [job, setJob] = useState(person.job);
  const [school, setSchool] = useState(p.school || "");
  const [interests, setInterests] = useState(person.interests.join(", "));
  const [languages, setLanguages] = useState(p.languages?.join(", ") || "");
  const [lifestyle, setLifestyle] = useState(p.lifestyle?.join(", ") || "");
  const [artists, setArtists] = useState(p.music_artists?.join(", ") || "");
  const [genres, setGenres] = useState(p.music_genres?.join(", ") || "");
  const [musicURL, setMusicURL] = useState(p.music_url || "");
  const [minimum, setMinimum] = useState(
    person.minimum_height_cm?.toString() || "",
  );
  const questions = [
    "A perfect weekend looks like…",
    "We'll get along if…",
    "One thing I'd love to try together…",
  ];
  const [answers, setAnswers] = useState(
    questions.map(
      (q) => p.prompts?.find((a) => a.question === q)?.answer || "",
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tags = (value: string) => [
    ...new Set(
      value
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
  const save = async () => {
    if (
      !name.trim() ||
      !/^\d+$/.test(age) ||
      Number(age) < 18 ||
      Number(age) > 99
    ) {
      setError("Enter your name and an age between 18 and 99.");
      return;
    }
    if (
      [height, minimum].some(
        (value) =>
          value &&
          (!/^\d+$/.test(value) || Number(value) < 100 || Number(value) > 230),
      )
    ) {
      setError("Height must be between 100 and 230 cm, or left blank.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(
        "/me/profile",
        json("PUT", {
          name: name.trim(),
          age: Number(age),
          height_cm: height ? Number(height) : null,
          intent,
          looking_for: lookingFor,
          bio,
          job,
          school,
          interests: tags(interests),
          languages: tags(languages),
          lifestyle: tags(lifestyle),
          music_artists: tags(artists),
          music_genres: tags(genres),
          music_url: musicURL.trim(),
          minimum_height_cm: minimum ? Number(minimum) : null,
          prompts: questions
            .map((question, i) => ({ question, answer: answers[i] }))
            .filter((a) => a.answer.trim()),
        }),
      );
      await saved();
      back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const field = (
    label: string,
    value: string,
    change: (value: string) => void,
    placeholder = "",
    limit = 200,
  ) => (
    <View style={{ gap: 8, marginBottom: 14 }}>
      <Text style={styles.text}>{label}</Text>
      <Field
        value={value}
        onChangeText={change}
        placeholder={placeholder}
        maxLength={limit}
        editable={!busy}
      />
    </View>
  );
  return (
    <>
      <Header title="Edit profile" onBack={() => (busy ? undefined : back())} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.body}
      >
        <Section title="The basics">
          {field("Name", name, setName, "Your name", 80)}
          {field("Age", age, setAge, "18+", 2)}
          {field("Height · optional", height, setHeight, "cm", 3)}
          {field("Work", job, setJob, "What do you do?", 80)}
          {field(
            "Education",
            school,
            setSchool,
            "School or field of study",
            100,
          )}
        </Section>
        <Section title="What brings you here?">
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
            <Pill
              label="Making friends"
              active={intent === "friendship"}
              onPress={busy ? undefined : () => setIntent("friendship")}
            />
            <Pill
              label="Dating"
              active={intent === "dating"}
              onPress={busy ? undefined : () => setIntent("dating")}
            />
          </View>
          {field(
            "I'm looking for",
            lookingFor,
            setLookingFor,
            "New in town, anime friends, a relationship…",
          )}
          <Text style={styles.text}>About me</Text>
          <Field
            value={bio}
            onChangeText={setBio}
            multiline
            maxLength={600}
            editable={!busy}
            placeholder="A little of your personality…"
            style={{
              minHeight: 110,
              textAlignVertical: "top",
              marginVertical: 12,
            }}
          />
        </Section>
        <Section title="Your world">
          {field(
            "Interests",
            interests,
            setInterests,
            "Anime, hiking, coffee…",
            500,
          )}
          {field(
            "Languages",
            languages,
            setLanguages,
            "English, Mandarin…",
            300,
          )}
          {field(
            "Lifestyle",
            lifestyle,
            setLifestyle,
            "Early bird, dog person, active weekends…",
            400,
          )}
          <Text style={styles.muted}>Separate items with commas.</Text>
        </Section>
        <Section title="Conversation starters">
          {questions.map((q, i) => (
            <View key={q}>
              {field(
                q,
                answers[i],
                (value) =>
                  setAnswers((a) =>
                    a.map((old, index) => (index === i ? value : old)),
                  ),
                "Your answer",
                300,
              )}
            </View>
          ))}
        </Section>
        <Section title="Music taste">
          {field(
            "Favorite artists",
            artists,
            setArtists,
            "Artists you keep on repeat",
            400,
          )}
          {field("Genres", genres, setGenres, "Indie, jazz, J-pop…", 300)}
          {field(
            "Music profile or playlist link",
            musicURL,
            setMusicURL,
            "https://open.spotify.com/…",
            500,
          )}
          <Text style={styles.muted}>
            Link Spotify, Apple Music, SoundCloud or YouTube Music. Your agent
            can use the artists and genres you share here.
          </Text>
        </Section>
        {intent === "dating" && (
          <Section title="Private preferences · only for your agent">
            {field("Minimum height", minimum, setMinimum, "Optional · cm", 3)}
            <Text style={styles.muted}>
              This filter isn't shown on your public card. Unknown heights won't
              meet a minimum you set.
            </Text>
          </Section>
        )}
        {!!error && (
          <Text
            accessibilityRole="alert"
            style={{ color: c.rose, marginBottom: 16 }}
          >
            {error}
          </Text>
        )}
        <Button label="Save profile" loading={busy} onPress={save} />
      </ScrollView>
    </>
  );
}
