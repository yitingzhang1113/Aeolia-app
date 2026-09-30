import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { api, Circle, Detail, Encounter, json, Person, Post } from "./src/api";
import {
  AgentArt,
  Avatar,
  Brand,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Header,
  Icon,
  IconButton,
  IconName,
  Pill,
  Section,
  Skeleton,
  styles,
} from "./src/ui";
import { colors as c } from "./src/theme";
import { AvatarCreator } from "./src/avatar";
import { ProfileEditor, ProfileExtras } from "./src/profile";
import { LocationSettings } from "./src/location";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import {
  MediaCarousel,
  MediaComposer,
  VideoPreview,
  uploadMedia,
} from "./src/media";
import {
  ChatImageBubble,
  FileBubble,
  InviteBubble,
  InviteCard,
  VoiceBubble,
  VoiceRecorder,
} from "./src/chatmedia";
import { DrawGame } from "./src/games/drawGuess";
import {
  ChatGroup,
  ChatsStore,
  friendKey,
  groupKey,
  useChats,
} from "./src/chats";

type Page =
  | "Home"
  | "Explore"
  | "Chats"
  | "Profile"
  | "EditProfile"
  | "Feed"
  | "Circle"
  | "Agent"
  | "Person"
  | "Encounter"
  | "Conversation"
  | "People"
  | "GroupChat"
  | "Call"
  | "GameRoom"
  | "Events"
  | "Settings"
  | "Plus"
  | "Game"
  | "Compose"
  | "Outfit"
  | "MyPosts";
type FeedTab = "for_you" | "friends" | "circles";
type CreateKind = "post" | "game" | "meetup";
type Event = {
  id: number;
  title: string;
  kind: "game" | "meetup";
  location: string | null;
  creator: Person;
};
type Message = {
  id: number;
  sender_id: number;
  body: string;
  kind: string;
  media_url?: string | null;
  game_room_id?: number | null;
};
type GameRoom = {
  id: number;
  kind: "uno" | "draw_guess";
  status: "inviting" | "active" | "ended";
  host: Person;
  guest: Person;
  winner_id: number | null;
};
const GAME_LABEL: Record<string, string> = {
  uno: "UNO",
  draw_guess: "Draw & Guess",
};
const tabs: { page: Page | "Create"; icon: IconName; activeIcon: IconName }[] =
  [
    { page: "Home", icon: "home-outline", activeIcon: "home" },
    { page: "Explore", icon: "search-outline", activeIcon: "search" },
    { page: "Create", icon: "add-circle-outline", activeIcon: "add-circle" },
    { page: "Chats", icon: "chatbubble-outline", activeIcon: "chatbubble" },
    { page: "Profile", icon: "person-outline", activeIcon: "person" },
  ];
const EMOJIS = ["😊", "😂", "❤️", "👍", "🎉", "🙏", "🔥", "😅", "🥹", "👀", "✨", "☕"];
const unavailable = (feature: string) =>
  Alert.alert(
    `${feature} isn't available yet`,
    "This feature is not connected in this prototype.",
  );

function useResource<T>(path: string, initial: T) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const request = useRef(0);
  const reload = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    setError("");
    try {
      const result = await api<T>(path);
      if (id === request.current) setData(result);
    } catch (e) {
      if (id === request.current)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    reload();
    return () => {
      request.current++;
    };
  }, [reload]);
  return { data, setData, loading, error, reload };
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Aeolia />
    </SafeAreaProvider>
  );
}
function Aeolia() {
  const [page, setPage] = useState<Page>("Home");
  const [history, setHistory] = useState<Page[]>([]);
  const account = useResource<Person | null>("/me", null);
  const circleData = useResource<Circle[]>("/circles", []);
  const discoveries = useResource<Encounter[]>("/encounters", []);
  const matchRequests = useResource<Encounter[]>("/match-requests", []);
  const [circle, setCircle] = useState<Circle | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [feedTab, setFeedTab] = useState<FeedTab>("for_you");
  const [sheet, setSheet] = useState(false);
  const [filters, setFilters] = useState(false);
  const [nearby, setNearby] = useState(true);
  const [createKind, setCreateKind] = useState<CreateKind>("post");
  const [postCircle, setPostCircle] = useState<Circle | null>(null);
  const [aiKey, setAiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [followed, setFollowed] = useState<number[]>([]);
  const [group, setGroup] = useState<ChatGroup | null>(null);
  const [call, setCall] = useState<{ person: Person; kind: "voice" | "video" } | null>(null);
  const [gameRoomId, setGameRoomId] = useState<number | null>(null);
  const chats = useChats();
  const me = account.data;
  const circles = circleData.data;
  const navigate = (next: Page) => {
    setHistory((h) => [...h, page]);
    setPage(next);
  };
  const back = () => {
    setPage(history[history.length - 1] || "Home");
    setHistory((h) => h.slice(0, -1));
  };
  const tab = (next: Page) => {
    setPage(next);
    setHistory([]);
  };
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } catch (e) {
      Alert.alert("Aeolia", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const patchMe = async (values: Partial<Person>) => {
    account.setData(await api<Person>("/me", json("PATCH", values)));
  };
  const openPerson = (id: number) =>
    run(async () => {
      setPerson(await api<Person>(`/users/${id}`));
      navigate("Person");
    });
  const openEncounter = (item: Encounter) =>
    run(async () => {
      if (!item.id) return;
      const d = await api<Detail>(`/encounters/${item.id}`);
      setEncounter(item);
      setDetail(d);
      navigate("Encounter");
    });
  const decideMatch = (choice: "interested" | "passed") =>
    run(async () => {
      if (!detail?.id) return;
      const result = await api<{ status: Detail["match_status"] }>(
        `/encounters/${detail.id}/decision`,
        json("POST", { choice }),
      );
      setDetail({ ...detail, match_status: result.status });
      await discoveries.reload();
      await matchRequests.reload();
      if (choice === "passed") {
        setEncounter(null);
        back();
      }
    });
  const openChat = (p: Person) => {
    setPerson(p);
    navigate("Conversation");
  };
  const openGroup = (g: ChatGroup) => {
    setGroup(g);
    navigate("GroupChat");
  };
  const startCall = (person: Person, kind: "voice" | "video") => {
    setCall({ person, kind });
    navigate("Call");
  };
  // TEMP-VERIFY: auto-open draw_guess room; remove after.
  useEffect(() => {
    setGameRoomId(4);
    setPage("GameRoom");
  }, []);
  const openGameRoom = (roomId: number, join: boolean) =>
    run(async () => {
      if (join)
        await api(`/games/rooms/${roomId}/join`, json("POST", {}));
      setGameRoomId(roomId);
      navigate("GameRoom");
    });
  const updateCircle = (item: Circle, kind: "follow" | "explore") =>
    run(async () => {
      await api(`/circles/${item.id}`, json("PATCH", { [kind]: !item[kind] }));
      await circleData.reload();
    });
  const selectedCircle = circles.find((x) => x.id === circle?.id) || null;
  const explore = (item?: Circle) => {
    const target = item || selectedCircle || circles.find((x) => x.explore);
    if (!target && (!nearby || item)) {
      setFilters(true);
      return;
    }
    if (!me?.agent_discoverable) {
      Alert.alert(
        "Allow discovery first",
        "Turn on discovery in Settings to let your agent meet people.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Settings", onPress: () => navigate("Settings") },
        ],
      );
      return;
    }
    if ((!nearby || item) && target && !target.explore) {
      setCircle(target);
      navigate("Circle");
      return;
    }
    if (nearby && !item && !me?.location) {
      navigate("Settings");
      return;
    }
    run(async () => {
      const result = await api<Detail>(
        nearby && !item ? "/explore/nearby" : `/explore/${target!.id}`,
        json("POST", { api_key: aiKey || undefined }),
      );
      if (!result.id) {
        Alert.alert(
          "Keep exploring",
          result.message || "No new encounter yet.",
        );
        return;
      }
      setEncounter(result);
      setDetail(result);
      await discoveries.reload();
      navigate("Encounter");
    });
  };
  const launchCreate = (kind: CreateKind) => {
    setCreateKind(kind);
    setPostCircle(page === "Circle" ? selectedCircle : null);
    setSheet(false);
    navigate("Compose");
  };
  const title = (label: string, right?: React.ReactNode) => (
    <Header title={label} onBack={back} right={right} />
  );
  const scroll = (children: React.ReactNode) => (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.body}
    >
      {children}
    </ScrollView>
  );
  const activeTab = ["Feed", "Events"].includes(page)
    ? "Home"
    : ["Circle", "Person", "Encounter"].includes(page)
      ? "Explore"
      : ["Settings", "Plus", "Outfit", "MyPosts"].includes(page)
        ? "Profile"
        : ["Conversation", "Agent", "People", "GroupChat", "Call", "GameRoom"].includes(page)
          ? "Chats"
          : page;
  const hideTabs = [
    "Agent",
    "Conversation",
    "Compose",
    "GroupChat",
    "Call",
    "GameRoom",
  ].includes(page);
  const content = () => {
    switch (page) {
      case "Home":
        return (
          <ScrollView
            contentContainerStyle={styles.body}
            refreshControl={
              <RefreshControl
                refreshing={account.loading}
                onRefresh={() => {
                  account.reload();
                  circleData.reload();
                  discoveries.reload();
                }}
                tintColor={c.teal}
              />
            }
          >
            <View style={ui.between}>
              <Brand />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="My profile"
                onPress={() => tab("Profile")}
                style={ui.avatarButton}
              >
                <Avatar size={38} outfit={me?.outfit} uri={me?.avatar_url} />
                <View style={ui.online} />
              </Pressable>
            </View>
            <Text style={[styles.title, { marginTop: 25 }]}>
              {new Date().getHours() < 12
                ? "Good morning"
                : new Date().getHours() < 18
                  ? "Good afternoon"
                  : "Good evening"}
            </Text>
            <Text style={[styles.muted, { marginTop: 3, marginBottom: 20 }]}>
              Brighter connections start here.
            </Text>
            {account.error && (
              <ErrorState message={account.error} onRetry={account.reload} />
            )}
            <View style={ui.hero}>
              <View style={ui.heroArt}>
                <AgentArt outfit={me?.outfit} uri={me?.avatar_url} />
              </View>
              <View style={{ flex: 1, gap: 9, paddingVertical: 18 }}>
                <Text style={[styles.heading, { fontSize: 16 }]}>
                  Your agent is getting to know you.
                </Text>
                <Text style={styles.muted}>
                  The more you share, the better I can find people, places, and
                  conversations you'll love.
                </Text>
                <Button
                  label="Talk to agent"
                  icon="chatbubble"
                  onPress={() => navigate("Agent")}
                />
                <Button
                  label="Change outfit"
                  icon="shirt-outline"
                  secondary
                  onPress={() => navigate("Outfit")}
                />
              </View>
            </View>
            <View
              style={[ui.flexRow, { marginVertical: 12, marginBottom: 24 }]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Friends feed"
                onPress={() => {
                  setFeedTab("friends");
                  navigate("Feed");
                }}
                style={({ pressed }) => [
                  ui.shortcut,
                  { backgroundColor: c.mint, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Icon name="people" size={31} />
                <Text style={ui.rowTitle}>Friends</Text>
                <Text style={styles.muted}>Posts from your people</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Events"
                onPress={() => navigate("Events")}
                style={({ pressed }) => [
                  ui.shortcut,
                  { backgroundColor: c.apricot, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Icon name="calendar-outline" size={31} color={c.orange} />
                <Text style={ui.rowTitle}>Events</Text>
                <Text style={styles.muted}>Plans & game rooms</Text>
              </Pressable>
            </View>
            <Section
              title="For you"
              action={
                <IconButton
                  name="chevron-forward"
                  label="Explore more people"
                  onPress={() => tab("Explore")}
                />
              }
            >
              {discoveries.loading ? (
                <Skeleton />
              ) : discoveries.error ? (
                <ErrorState
                  message={discoveries.error}
                  onRetry={discoveries.reload}
                />
              ) : discoveries.data.length ? (
                <AgentPicks picks={discoveries.data} onPress={openEncounter} />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Find people"
                  onPress={() => tab("Explore")}
                  style={{
                    alignItems: "center",
                    alignSelf: "flex-start",
                    padding: 12,
                    gap: 8,
                  }}
                >
                  <View
                    style={{
                      width: 76,
                      height: 76,
                      borderRadius: 38,
                      backgroundColor: c.mint,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="add-outline" size={30} />
                  </View>
                  <Text style={styles.muted}>Find people</Text>
                </Pressable>
              )}
            </Section>
            <Section
              title="Following circles"
              action={
                <TextLink label="See all" onPress={() => tab("Explore")} />
              }
            >
              {circleData.loading ? (
                <Skeleton />
              ) : circleData.error ? (
                <ErrorState
                  message={circleData.error}
                  onRetry={circleData.reload}
                />
              ) : circles.filter((x) => x.follow).length ? (
                circles
                  .filter((x) => x.follow)
                  .map((x) => (
                    <CircleRow
                      key={x.id}
                      circle={x}
                      onPress={() => {
                        setCircle(x);
                        navigate("Circle");
                      }}
                    />
                  ))
              ) : (
                <EmptyState
                  title="Find your people"
                  body="Follow a circle to bring its public posts into your feed."
                  action={
                    <Button
                      label="Browse circles"
                      onPress={() => tab("Explore")}
                      secondary
                    />
                  }
                />
              )}
            </Section>
          </ScrollView>
        );
      case "Feed":
        return (
          <>
            {title("Feed")}
            <Feed
              tab={feedTab}
              setTab={setFeedTab}
              circles={circles}
              openPerson={openPerson}
              create={() => launchCreate("post")}
            />
          </>
        );
      case "Explore":
        return (
          <ScrollView contentContainerStyle={styles.body}>
            <View style={ui.between}>
              <Brand />
              <TextLink
                label="Add by ID"
                icon="person-add-outline"
                onPress={() => tab("Chats")}
              />
            </View>
            <Text style={[styles.title, { marginTop: 24 }]}>Explore</Text>
            <Text style={[styles.muted, { marginTop: 3, marginBottom: 15 }]}>
              Discover people, ideas and worlds.
            </Text>
            <View style={ui.flexRow}>
              <View style={{ flex: 1 }}>
                <Pill
                  icon="compass-outline"
                  label={
                    nearby
                      ? `Near me · ${me?.location?.radius_km || 25} km`
                      : selectedCircle?.name || "Interest circles"
                  }
                  onPress={() => setNearby(!nearby)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Pill
                  icon="options-outline"
                  label={nearby ? me?.city || "Set location" : "Your interests"}
                  onPress={() =>
                    nearby ? navigate("Settings") : setFilters(true)
                  }
                />
              </View>
            </View>
            {discoveries.loading ? (
              <Skeleton />
            ) : discoveries.error ? (
              <ErrorState
                message={discoveries.error}
                onRetry={discoveries.reload}
              />
            ) : (
              <Network
                me={me}
                encounters={discoveries.data}
                openPerson={openPerson}
              />
            )}
            <Text
              style={[styles.muted, { textAlign: "center", marginBottom: 14 }]}
            >
              {nearby
                ? "Your agent meets people within your chosen distance, then screens your compatibility."
                : "Explore shared interests through circles."}
            </Text>
            <View style={[ui.flexRow, { marginBottom: 10 }]}>
              <View style={{ flex: 1 }}>
                <Button
                  icon="shuffle-outline"
                  label="Surprise me"
                  secondary
                  loading={busy}
                  onPress={() => {
                    const eligible = circles.filter((x) => x.explore);
                    explore(
                      eligible[Math.floor(Math.random() * eligible.length)],
                    );
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  icon="options-outline"
                  label="Set filters"
                  secondary
                  onPress={() =>
                    nearby ? navigate("Settings") : setFilters(true)
                  }
                />
              </View>
            </View>
            <Button
              label={
                busy
                  ? "Agents are talking & screening…"
                  : "Find a match through agent chat"
              }
              icon="paper-plane-outline"
              onPress={() => explore()}
              loading={busy}
            />
            <View style={{ height: 20 }} />
            <Section title="For you">
              <AgentPicks picks={discoveries.data} onPress={openEncounter} />
            </Section>
            {!!matchRequests.data.length && (
              <Section title="Want to match with you">
                {matchRequests.data.map((request) => (
                  <Recommendation
                    key={request.id}
                    encounter={request}
                    onPress={() => openEncounter(request)}
                  />
                ))}
              </Section>
            )}
            <View style={{ height: 24 }} />
            <Section title="Find your circles">
              {circleData.loading ? (
                <Skeleton />
              ) : circleData.error ? (
                <ErrorState
                  message={circleData.error}
                  onRetry={circleData.reload}
                />
              ) : circles.length ? (
                circles.map((x) => (
                  <CircleRow
                    key={x.id}
                    circle={x}
                    onPress={() => {
                      setCircle(x);
                      navigate("Circle");
                    }}
                  />
                ))
              ) : (
                <EmptyState
                  title="No circles yet"
                  body="New communities will appear here."
                  action={
                    <Button
                      label="Refresh"
                      secondary
                      onPress={circleData.reload}
                    />
                  }
                />
              )}
            </Section>
          </ScrollView>
        );
      case "Circle":
        return (
          <>
            {title(selectedCircle?.name || "Circle")}
            {selectedCircle &&
              scroll(
                <>
                  <View
                    style={[
                      ui.flexRow,
                      { alignItems: "center", marginBottom: 18 },
                    ]}
                  >
                    <View style={ui.circleEmblem}>
                      <Icon name="planet" size={38} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.heading}>{selectedCircle.name}</Text>
                      <Text style={styles.muted}>
                        {selectedCircle.description}
                      </Text>
                    </View>
                  </View>
                  <Button
                    label={
                      selectedCircle.follow ? "Following" : "Follow circle"
                    }
                    icon={
                      selectedCircle.follow ? "checkmark" : "person-add-outline"
                    }
                    loading={busy}
                    onPress={() => updateCircle(selectedCircle, "follow")}
                  />
                  <View style={[ui.notice, { marginTop: 16 }]}>
                    <Icon name="information-circle-outline" size={16} />
                    <Text style={[styles.muted, { flex: 1 }]}>
                      Posts are public. Following adds them to your feed.
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.card,
                      ui.flexRow,
                      { alignItems: "center", marginVertical: 12 },
                    ]}
                  >
                    <Icon name="sparkles-outline" />
                    <View style={{ flex: 1 }}>
                      <Text style={ui.rowTitle}>Let my agent explore</Text>
                      <Text style={styles.muted}>
                        Allow your agent to discover people here. Separate from
                        following.
                      </Text>
                    </View>
                    <Switch
                      accessibilityLabel="Let my agent explore this circle"
                      disabled={busy}
                      value={selectedCircle.explore}
                      onValueChange={() =>
                        updateCircle(selectedCircle, "explore")
                      }
                      trackColor={{ true: c.teal }}
                    />
                  </View>
                  <Button
                    label={
                      busy
                        ? "Agents are talking & screening…"
                        : "Find a match through agent chat"
                    }
                    onPress={() => explore(selectedCircle)}
                    loading={busy}
                    secondary
                  />
                  <View style={{ height: 24 }} />
                  <Section title="Public posts">
                    <PostList
                      path={`/circles/${selectedCircle.id}/posts`}
                      openPerson={openPerson}
                      circles={circles}
                      create={() => launchCreate("post")}
                    />
                  </Section>
                </>,
              )}
          </>
        );
      case "Agent":
        return (
          <>
            {title(
              "My agent",
              <IconButton
                name="settings-outline"
                label="Agent settings"
                onPress={() => navigate("Settings")}
              />,
            )}
            <Agent me={me} aiKey={aiKey} save={patchMe} />
          </>
        );
      case "EditProfile":
        return me ? (
          <ProfileEditor person={me} back={back} saved={account.reload} />
        ) : (
          <Skeleton />
        );
      case "Profile":
        return (
          <>
            {scroll(
              <>
                <View style={ui.between}>
                  <Text style={[styles.title, { fontSize: 24 }]}>
                    My profile
                  </Text>
                  <IconButton
                    name="settings-outline"
                    label="Settings"
                    onPress={() => navigate("Settings")}
                  />
                </View>
                {account.loading ? (
                  <Skeleton />
                ) : account.error ? (
                  <ErrorState
                    message={account.error}
                    onRetry={account.reload}
                  />
                ) : (
                  me && (
                    <>
                      <ProfileInfo person={me} />
                      <View style={[ui.flexRow, { marginVertical: 16 }]}>
                        <View style={{ flex: 1 }}>
                          <Button
                            label="Edit profile"
                            secondary
                            icon="person-outline"
                            onPress={() => navigate("EditProfile")}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Button
                            label="Share ID"
                            secondary
                            icon="share-outline"
                            onPress={() =>
                              run(async () => {
                                await Share.share({
                                  message: `Find me on Aeolia: @${me.handle}`,
                                });
                              })
                            }
                          />
                        </View>
                      </View>
                    </>
                  )
                )}
                <View
                  style={[
                    ui.flexRow,
                    { marginTop: 12, alignItems: "flex-start" },
                  ]}
                >
                  <View
                    style={[
                      styles.card,
                      { flex: 1, backgroundColor: c.soft, padding: 12 },
                    ]}
                  >
                    <Text style={ui.rowTitle}>My avatar</Text>
                    <View style={{ height: 180 }}>
                      <AgentArt outfit={me?.outfit} uri={me?.avatar_url} />
                    </View>
                    <Button
                      label="Change outfit"
                      secondary
                      onPress={() => navigate("Outfit")}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 12 }}>
                    <Text style={ui.rowTitle}>Recent posts</Text>
                    <View style={ui.photoPlaceholder}>
                      <Icon name="images-outline" size={30} />
                      <Text style={[styles.muted, { textAlign: "center" }]}>
                        Your moments, shared with your people.
                      </Text>
                    </View>
                    <Button
                      label="View my posts"
                      secondary
                      onPress={() => navigate("MyPosts")}
                    />
                  </View>
                </View>
              </>,
            )}
          </>
        );
      case "MyPosts":
        return (
          <>
            {title("My posts")}
            {scroll(
              <PostList
                path="/feed?tab=for_you"
                authorId={me?.id}
                openPerson={openPerson}
                circles={circles}
                create={() => launchCreate("post")}
              />,
            )}
          </>
        );
      case "Outfit":
        return <AvatarCreator me={me} back={back} saved={account.reload} />;
      case "Person":
        return (
          <>
            {title("Profile")}
            {person &&
              scroll(
                <>
                  <ProfileInfo person={person} />
                  <View style={[ui.flexRow, { marginVertical: 18 }]}>
                    <View style={{ flex: 1 }}>
                      <Button
                        label={
                          person.mutual
                            ? `Chat with ${person.name}`
                            : followed.includes(person.id)
                              ? "Following"
                              : "Follow"
                        }
                        icon={
                          person.mutual
                            ? "chatbubble-outline"
                            : "person-add-outline"
                        }
                        disabled={
                          !person.mutual && followed.includes(person.id)
                        }
                        loading={busy}
                        onPress={() => {
                          if (person.mutual) {
                            openChat(person);
                            return;
                          }
                          run(async () => {
                            const res = await api<{ mutual: boolean }>(
                              `/users/${person.id}/follow`,
                              { method: "POST" },
                            );
                            setPerson({ ...person, mutual: res.mutual });
                            setFollowed((ids) => [...ids, person.id]);
                          });
                        }}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button
                        label="Invite to game"
                        secondary
                        icon="game-controller-outline"
                        onPress={() => unavailable("Game invitations")}
                      />
                    </View>
                  </View>
                  {!person.mutual && (
                    <Text style={[styles.muted, { marginBottom: 20 }]}>
                      Chat opens when you follow each other.
                    </Text>
                  )}
                  {discoveries.data
                    .filter((x) => x.candidate?.id === person.id)
                    .slice(0, 1)
                    .map((x) => (
                      <Recommendation
                        key={x.id}
                        encounter={x}
                        onPress={() => openEncounter(x)}
                      />
                    ))}
                  <View style={{ height: 24 }} />
                  <Section title="About">
                    <Text style={styles.text}>
                      {person.bio || "No bio shared yet."}
                    </Text>
                  </Section>
                </>,
              )}
          </>
        );
      case "Encounter":
        return (
          <>
            {title("Match card")}
            {detail &&
              scroll(
                <>
                  <View style={[ui.encounterHero, ui.flexRow]}>
                    <Avatar
                      size={76}
                      outfit={me?.outfit}
                      uri={me?.avatar_url}
                    />
                    <Icon name="swap-horizontal" size={30} />
                    <Avatar
                      size={76}
                      outfit={encounter?.candidate?.outfit}
                      uri={encounter?.candidate?.avatar_url}
                    />
                  </View>
                  {encounter?.candidate && (
                    <View style={[styles.card, { gap: 12 }]}>
                      <Text style={styles.title}>
                        {encounter.candidate.name}
                      </Text>
                      <Text style={styles.muted}>
                        {encounter.candidate.city} · {encounter.candidate.job}
                      </Text>
                      <Text style={styles.text}>{encounter.candidate.bio}</Text>
                      <ProfileExtras person={encounter.candidate} />
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        {encounter.candidate.interests.map((interest) => (
                          <Pill key={interest} label={interest} />
                        ))}
                      </View>
                    </View>
                  )}
                  <View style={{ gap: 10, marginVertical: 18 }}>
                    <Text style={styles.muted}>
                      {detail.match_status === "matched"
                        ? "You both chose to match. You can now chat."
                        : detail.match_status === "pending"
                          ? "Match requested. Waiting for their decision."
                          : "Your agent made the introduction. You decide what happens next."}
                    </Text>
                    {detail.match_status === "matched" ? (
                      <Button
                        label="Start chatting"
                        onPress={() =>
                          encounter?.candidate && openChat(encounter.candidate)
                        }
                      />
                    ) : (
                      <>
                        <Button
                          label={
                            detail.match_status === "pending"
                              ? "Match requested"
                              : "I'd like to match"
                          }
                          disabled={busy || detail.match_status === "pending"}
                          onPress={() => decideMatch("interested")}
                        />
                        <Button
                          label="Pass"
                          secondary
                          disabled={busy}
                          onPress={() => decideMatch("passed")}
                        />
                      </>
                    )}
                  </View>
                  <Section
                    title={`Why your agent recommends ${encounter?.candidate?.name || "them"}`}
                  >
                    <View style={[styles.card, { backgroundColor: c.apricot }]}>
                      <Text style={styles.text}>{detail.reason}</Text>
                      <Text style={[styles.muted, { marginTop: 12 }]}>
                        Your agent screened this match after talking with their
                        agent.
                      </Text>
                      {detail.assessment?.citations.map((citation) => (
                        <View
                          key={citation.turn}
                          style={{
                            marginTop: 14,
                            borderLeftWidth: 3,
                            borderLeftColor: c.teal,
                            paddingLeft: 12,
                          }}
                        >
                          <Text style={[styles.muted, { marginBottom: 5 }]}>
                            Message {citation.turn} ·{" "}
                            {citation.speaker_id === me?.id
                              ? "Your agent"
                              : `${encounter?.candidate?.name}'s agent`}
                          </Text>
                          <Text style={styles.text}>“{citation.quote}”</Text>
                        </View>
                      ))}
                    </View>
                  </Section>
                  <Section title="Based on public posts">
                    {detail.evidence?.length ? (
                      detail.evidence.map((p) => (
                        <View key={p.post_id} style={styles.card}>
                          <Text style={styles.text}>{p.excerpt}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.muted}>
                        Your agents crossed paths through a shared circle. No
                        public post evidence is available.
                      </Text>
                    )}
                  </Section>
                  <Section title="Agent conversation">
                    {detail.turns.length ? (
                      detail.turns.map((t, i) => (
                        <ChatBubble
                          key={i}
                          mine={t.speaker_id === me?.id}
                          body={t.body}
                          label={
                            t.speaker_id === me?.id
                              ? `${i + 1} · Your agent`
                              : `${i + 1} · ${encounter?.candidate?.name}'s agent`
                          }
                        />
                      ))
                    ) : (
                      <View style={ui.notice}>
                        <Icon name="lock-closed-outline" size={17} />
                        <Text style={[styles.muted, { flex: 1 }]}>
                          Waiting for mutual permission. Both people must allow
                          their agents to talk.
                        </Text>
                      </View>
                    )}
                  </Section>
                  <View style={{ height: 10 }} />
                  <Button
                    label="View real profile"
                    secondary
                    onPress={() =>
                      encounter?.candidate && openPerson(encounter.candidate.id)
                    }
                  />
                </>,
              )}
          </>
        );
      case "Chats":
        return (
          <Chats
            me={me}
            chats={chats}
            openAgent={() => navigate("Agent")}
            openChat={openChat}
            openGroup={openGroup}
            openPeople={() => navigate("People")}
          />
        );
      case "People":
        return (
          <People
            chats={chats}
            back={back}
            openChat={openChat}
            openGroup={openGroup}
            openPerson={openPerson}
          />
        );
      case "GroupChat":
        return group ? (
          <GroupConversation
            group={group}
            me={me}
            chats={chats}
            back={back}
          />
        ) : null;
      case "Conversation":
        return person ? (
          <Conversation
            person={person}
            me={me}
            back={back}
            openProfile={() => openPerson(person.id)}
            startCall={(kind) => startCall(person, kind)}
            openGameRoom={openGameRoom}
            reason={
              discoveries.data.find((x) => x.candidate?.id === person.id)
                ?.reason
            }
          />
        ) : null;
      case "GameRoom":
        return gameRoomId ? (
          <GameRoom
            roomId={gameRoomId}
            me={me}
            back={back}
            startCall={startCall}
          />
        ) : null;
      case "Call":
        return call ? (
          <CallScreen
            person={call.person}
            kind={call.kind}
            end={back}
          />
        ) : null;
      case "Events":
        return (
          <>
            {title("Events")}
            <Events
              create={() => setSheet(true)}
              openGame={() => navigate("Game")}
            />
          </>
        );
      case "Compose":
        return createKind === "post" ? (
          <MediaComposer
            circle={postCircle}
            onBack={back}
            onCreated={() => {
              setPage("Feed");
              setHistory((h) => h.slice(0, -1));
              setFeedTab("for_you");
            }}
          />
        ) : (
          <Composer
            kind={createKind}
            circle={postCircle}
            onBack={back}
            onCreated={() => {
              setPage("Events");
              setHistory((h) => h.slice(0, -1));
              setFeedTab("for_you");
            }}
          />
        );
      case "Game":
        return (
          <>
            {title("Game room")}
            {scroll(
              <EmptyState
                icon="game-controller-outline"
                title="A little friendly competition"
                body="Game plans are available. Live multiplayer and invitations aren't connected yet."
                action={
                  <Button label="Back to events" onPress={back} secondary />
                }
              />,
            )}
          </>
        );
      case "Settings":
        return (
          <>
            {title("Settings")}
            {scroll(
              <>
                <Section title="You & your agent">
                  <SettingsRow
                    icon="person-outline"
                    title="Profile & avatar"
                    onPress={() => navigate("Profile")}
                  />
                  <SettingsRow
                    icon="shirt-outline"
                    title="Change outfit"
                    onPress={() => navigate("Outfit")}
                  />
                  <SettingsRow
                    icon="sparkles-outline"
                    title="Agent preferences & memory"
                    onPress={() => navigate("Agent")}
                  />
                  <SettingsRow
                    icon="compass-outline"
                    title="Circle exploration permissions"
                    onPress={() => navigate("Explore")}
                  />
                </Section>
                <Section title="Location · Near me">
                  <LocationSettings me={me} saved={account.reload} />
                </Section>
                <Section title="Privacy & discovery">
                  <ToggleRow
                    title="Allow agent discovery"
                    body="Meet people nearby or through interests. Your coordinates are never shown to other members."
                    value={!!me?.agent_discoverable}
                    disabled={busy || !me}
                    onChange={(v) =>
                      run(() => patchMe({ agent_discoverable: v }))
                    }
                  />
                  <ToggleRow
                    title="Agent-to-agent chat"
                    body="Your agent can talk only when both people agree."
                    value={!!me?.agent_chat_allowed}
                    disabled={busy || !me}
                    onChange={(v) =>
                      run(() => patchMe({ agent_chat_allowed: v }))
                    }
                  />
                  <SettingsRow
                    icon="notifications-outline"
                    title="Notifications"
                    detail="Not connected"
                    onPress={() => unavailable("Notifications")}
                  />
                </Section>
                <Section title="AI connection">
                  <Text style={styles.muted}>
                    Optional provider key, kept only for this session. It is
                    never saved to your profile.
                  </Text>
                  <Field
                    value={aiKey}
                    onChangeText={setAiKey}
                    secureTextEntry
                    autoCorrect={false}
                    autoCapitalize="none"
                    placeholder="Personal API key"
                  />
                  <Button
                    label="Clear key"
                    secondary
                    disabled={!aiKey}
                    onPress={() => setAiKey("")}
                  />
                </Section>
                <Section title="Membership & support">
                  <SettingsRow
                    icon="planet-outline"
                    title="Aeolia Plus"
                    detail="Free plan"
                    onPress={() => navigate("Plus")}
                  />
                  <SettingsRow
                    icon="help-circle-outline"
                    title="About Aeolia"
                    onPress={() =>
                      Alert.alert(
                        "Aeolia · Development preview",
                        "Real people. A brighter you.\nVersion 0.1.0",
                      )
                    }
                  />
                </Section>
              </>,
            )}
          </>
        );
      case "Plus":
        return (
          <>
            {title("Aeolia Plus")}
            {scroll(
              <>
                <View
                  style={{ alignItems: "center", paddingVertical: 25, gap: 14 }}
                >
                  <Icon name="planet-outline" size={55} />
                  <Text style={[styles.title, { textAlign: "center" }]}>
                    A wider world of connections
                  </Text>
                  <Text style={[styles.muted, { textAlign: "center" }]}>
                    Give your agent more room to explore.
                  </Text>
                </View>
                <View style={[styles.card, { marginBottom: 12, gap: 10 }]}>
                  <Pill label="YOUR PLAN" />
                  <Text style={styles.heading}>Free</Text>
                  <Text style={styles.title}>$0</Text>
                  <Text style={styles.text}>Basic agent exploration</Text>
                  <Text style={styles.muted}>
                    Profiles, posts, friends and human chats.
                  </Text>
                </View>
                <View
                  style={[
                    styles.card,
                    { borderColor: c.teal, gap: 12, backgroundColor: c.mint },
                  ]}
                >
                  <Text style={styles.heading}>Aeolia Plus</Text>
                  <Text style={styles.text}>
                    More exploration sessions across more circles.
                  </Text>
                  <Text style={styles.muted}>
                    Pricing and renewal terms will be available when
                    subscriptions launch.
                  </Text>
                  <Button label="Coming soon" disabled onPress={() => {}} />
                </View>
                <View style={{ height: 20 }} />
                <Button
                  label="Manage subscription · unavailable"
                  secondary
                  disabled
                  onPress={() => {}}
                />
              </>,
            )}
          </>
        );
    }
  };
  return (
    <SafeAreaView style={styles.page} edges={["top", "bottom"]}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ flex: 1 }}>{content()}</View>
        {!hideTabs && (
          <View style={ui.nav}>
            {tabs.map((t) => (
              <Pressable
                key={t.page}
                accessibilityRole="tab"
                accessibilityLabel={t.page}
                accessibilityState={{ selected: activeTab === t.page }}
                onPress={() =>
                  t.page === "Create" ? setSheet(true) : tab(t.page)
                }
                style={({ pressed }) => [
                  ui.tab,
                  { opacity: pressed ? 0.55 : 1 },
                ]}
              >
                <Icon
                  name={activeTab === t.page ? t.activeIcon : t.icon}
                  color={activeTab === t.page ? c.teal : c.muted}
                  size={t.page === "Create" ? 29 : 23}
                />
                <Text
                  style={{
                    fontSize: 10,
                    color: activeTab === t.page ? c.teal : c.muted,
                    fontWeight: activeTab === t.page ? "700" : "400",
                  }}
                >
                  {t.page}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </KeyboardAvoidingView>
      <BottomSheet visible={sheet} title="Create" close={() => setSheet(false)}>
        {(
          [
            {
              kind: "post",
              name: "Post",
              body: "Share photos, videos or thoughts",
              icon: "image-outline",
            },
            {
              kind: "game",
              name: "Game room",
              body: "Plan a game with friends",
              icon: "game-controller-outline",
            },
            {
              kind: "meetup",
              name: "Meetup plan",
              body: "Make an in-person plan",
              icon: "calendar-outline",
            },
          ] as const
        ).map((x) => (
          <Pressable
            key={x.kind}
            accessibilityRole="button"
            onPress={() => launchCreate(x.kind)}
            style={({ pressed }) => [
              ui.createRow,
              pressed && { backgroundColor: c.mint },
            ]}
          >
            <View style={ui.iconCircle}>
              <Icon name={x.icon} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={ui.rowTitle}>{x.name}</Text>
              <Text style={styles.muted}>{x.body}</Text>
            </View>
            <Icon name="chevron-forward" size={16} />
          </Pressable>
        ))}
      </BottomSheet>
      <BottomSheet
        visible={filters}
        title="Explore your circles"
        close={() => setFilters(false)}
      >
        <Text style={[styles.muted, { marginBottom: 16 }]}>
          Choose a community for your next encounter. Exploration permission is
          managed separately inside each circle.
        </Text>
        <Pill
          label="All circles"
          active={!selectedCircle}
          onPress={() => {
            setCircle(null);
            setFilters(false);
          }}
        />
        {circles.map((x) => (
          <View key={x.id} style={{ marginTop: 10 }}>
            <Pill
              label={x.name}
              active={selectedCircle?.id === x.id}
              onPress={() => {
                setCircle(x);
                setFilters(false);
              }}
            />
          </View>
        ))}
        <Text style={[styles.heading, { marginTop: 24, marginBottom: 12 }]}>
          Your shared interests
        </Text>
        <View style={ui.tags}>
          {me?.interests.map((x) => (
            <Pill key={x} label={x} />
          ))}
        </View>
        <Text style={[styles.muted, { marginTop: 12 }]}>
          Your agent uses these interests to explain connections.
        </Text>
      </BottomSheet>
    </SafeAreaView>
  );
}

function TextLink({
  label,
  onPress,
  icon,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={ui.textLink}>
      {icon && <Icon name={icon} size={17} />}
      <Text style={{ color: c.teal, fontSize: 12, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
}
function CircleRow({
  circle,
  onPress,
}: {
  circle: Circle;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        ui.flexRow,
        { alignItems: "center", padding: 12 },
        pressed && { backgroundColor: c.mint },
      ]}
    >
      <View style={ui.iconCircle}>
        <Icon name="planet-outline" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={ui.rowTitle}>{circle.name}</Text>
        <Text style={styles.muted}>
          {circle.follow ? "Following · " : ""}
          {circle.explore ? "Agent exploring" : circle.description}
        </Text>
      </View>
      <Icon name="chevron-forward" size={17} />
    </Pressable>
  );
}
function AgentPicks({
  picks,
  onPress,
}: {
  picks: Encounter[];
  onPress: (pick: Encounter) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 20, paddingVertical: 8 }}
    >
      {picks.map((pick) => (
        <Pressable
          key={pick.id}
          accessibilityRole="button"
          accessibilityLabel={`View ${pick.candidate?.name}'s match card`}
          onPress={() => onPress(pick)}
          style={({ pressed }) => ({
            width: 82,
            alignItems: "center",
            gap: 9,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <View
            style={{
              borderWidth: 1.5,
              borderColor: c.teal,
              borderRadius: 42,
              padding: 4,
            }}
          >
            <Avatar
              size={70}
              outfit={pick.candidate?.outfit}
              uri={pick.candidate?.avatar_url}
            />
          </View>
          <Text style={[styles.text, { fontSize: 13 }]} numberOfLines={1}>
            {pick.candidate?.name}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function Recommendation({
  encounter,
  onPress,
}: {
  encounter: Encounter;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: pressed ? c.mint : "#F3F8F6", gap: 10 },
      ]}
    >
      <View style={[ui.flexRow, { alignItems: "center" }]}>
        <Avatar
          outfit={encounter.candidate?.outfit}
          uri={encounter.candidate?.avatar_url}
          size={48}
        />
        <View style={{ flex: 1 }}>
          <Text style={ui.rowTitle}>
            Your agent recommends {encounter.candidate?.name}
          </Text>
          <Text style={styles.muted}>{encounter.reason}</Text>
        </View>
        <Icon name="chevron-forward" size={17} />
      </View>
      <View style={ui.flexRow}>
        <Icon name="sparkles-outline" size={14} />
        <Text style={[styles.muted, { color: c.teal }]}>
          Read their conversation & why you match
        </Text>
      </View>
    </Pressable>
  );
}
function BottomSheet({
  visible,
  title,
  close,
  children,
}: {
  visible: boolean;
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
    >
      <View style={ui.modal}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss sheet"
          onPress={close}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView edges={["bottom"]} style={ui.sheet}>
          <View style={ui.handle} />
          <View style={ui.between}>
            <Text style={styles.heading}>{title}</Text>
            <IconButton name="close-outline" label="Close" onPress={close} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            {children}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
function ProfileInfo({ person }: { person: Person }) {
  return (
    <>
      <View style={ui.photoGrid}>
        <View
          style={[ui.photoPlaceholder, { flex: 2, backgroundColor: "#E4EBE7" }]}
        >
          <Icon name="person-outline" size={48} />
          <Text style={styles.muted}>No profile photo yet</Text>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          {["image-outline", "camera-outline", "images-outline"].map((name) => (
            <View
              key={name}
              style={[
                ui.photoPlaceholder,
                { flex: 1, backgroundColor: c.soft },
              ]}
            >
              <Icon name={name as IconName} size={22} />
            </View>
          ))}
        </View>
      </View>
      <View style={[ui.between, { marginTop: 14 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.heading, { fontSize: 22 }]}>
            @{person.handle.split(".")[0]}
          </Text>
          <Text style={styles.muted}>Aeolia ID: {person.handle}</Text>
        </View>
        <Avatar size={45} outfit={person.outfit} uri={person.avatar_url} />
      </View>
      <View style={[ui.flexRow, { marginVertical: 14, flexWrap: "wrap" }]}>
        {person.job && (
          <View style={ui.meta}>
            <Icon name="briefcase-outline" size={14} />
            <Text style={styles.muted}>{person.job}</Text>
          </View>
        )}
        {person.city && (
          <View style={ui.meta}>
            <Icon name="location-outline" size={14} />
            <Text style={styles.muted}>{person.city}</Text>
          </View>
        )}
      </View>
      <View style={ui.tags}>
        {person.interests.map((x) => (
          <Pill key={x} label={x} />
        ))}
      </View>
      <Text style={[styles.text, { marginTop: 14 }]}>{person.bio}</Text>
      <ProfileExtras person={person} />
    </>
  );
}
function Network({
  me,
  encounters,
  openPerson,
}: {
  me: Person | null;
  encounters: Encounter[];
  openPerson: (id: number) => void;
}) {
  const nodes = encounters
    .filter(
      (x, i, a) =>
        x.candidate &&
        a.findIndex((y) => y.candidate?.id === x.candidate?.id) === i,
    )
    .slice(0, 5);
  const points = [
    { left: "6%", top: "10%" },
    { left: "73%", top: "15%" },
    { left: "77%", top: "66%" },
    { left: "12%", top: "70%" },
    { left: "43%", top: "82%" },
  ] as const;
  return (
    <View style={ui.network}>
      {[
        { angle: "28deg", top: "35%" },
        { angle: "-32deg", top: "58%" },
        { angle: "83deg", top: "48%" },
        { angle: "-60deg", top: "45%" },
      ].map((x, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            width: "83%",
            height: 1,
            backgroundColor: "#D5E7E4",
            left: "8%",
            top: x.top as `${number}%`,
            transform: [{ rotate: x.angle }],
          }}
        />
      ))}
      {Array.from({ length: 18 }, (_, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: `${6 + ((i * 29) % 87)}%`,
            top: `${8 + ((i * 17) % 80)}%`,
            width: i % 3 === 0 ? 7 : 4,
            height: i % 3 === 0 ? 7 : 4,
            borderRadius: 5,
            backgroundColor: i % 4 === 0 ? "#F4AF86" : "#86BABA",
          }}
        />
      ))}
      <View style={ui.centerNode}>
        <Avatar size={79} outfit={me?.outfit} uri={me?.avatar_url} />
        <Text style={[styles.muted, { color: c.teal, marginTop: 4 }]}>
          Your agent
        </Text>
      </View>
      {nodes.length
        ? nodes.map((x, i) => (
            <Pressable
              key={x.candidate!.id}
              accessibilityRole="button"
              accessibilityLabel={`View ${x.candidate!.name}'s profile`}
              onPress={() => openPerson(x.candidate!.id)}
              style={[ui.graphNode, points[i]]}
            >
              <Avatar
                size={50}
                outfit={x.candidate!.outfit}
                uri={x.candidate!.avatar_url}
              />
              <Text style={[styles.muted, { marginTop: 4 }]}>
                {x.candidate!.name}
              </Text>
            </Pressable>
          ))
        : points.slice(0, 4).map((p, i) => (
            <View key={i} style={[ui.graphNode, p]}>
              <View style={ui.networkTopic}>
                <Icon
                  name={
                    (
                      [
                        "color-palette-outline",
                        "game-controller-outline",
                        "cafe-outline",
                        "chatbubble-outline",
                      ] as const
                    )[i]
                  }
                  size={23}
                />
              </View>
            </View>
          ))}
    </View>
  );
}
function PostCard({
  post,
  circles,
  openPerson,
}: {
  post: Post;
  circles: Circle[];
  openPerson: (id: number) => void;
}) {
  return (
    <View style={ui.post}>
      <View style={ui.between}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View ${post.author.name}`}
          onPress={() => openPerson(post.author.id)}
          style={[ui.flexRow, { alignItems: "center", flex: 1 }]}
        >
          <Avatar
            size={40}
            outfit={post.author.outfit}
            uri={post.author.avatar_url}
          />
          <View style={{ flex: 1 }}>
            <Text style={ui.rowTitle}>{post.author.name}</Text>
            <Text style={styles.muted}>
              {post.circle_id
                ? `${circles.find((x) => x.id === post.circle_id)?.name || "Circle"} · Public`
                : post.visibility === "public"
                  ? "Public"
                  : "Friends only"}
            </Text>
          </View>
        </Pressable>
        <IconButton
          name="ellipsis-horizontal"
          label="Post options"
          onPress={() =>
            Alert.alert(
              "Post visibility",
              post.circle_id || post.visibility === "public"
                ? "This post is public."
                : "Only mutual friends can see this post.",
            )
          }
        />
      </View>
      <Text style={[styles.text, { marginTop: 12 }]}>{post.body}</Text>
      {post.media?.length ? (
        <MediaCarousel items={post.media} cover={post.cover_url} />
      ) : post.media_url && post.media_type === "image" ? (
        <Image
          source={{ uri: post.media_url }}
          accessibilityLabel="Post photo"
          style={ui.postImage}
          resizeMode="cover"
        />
      ) : post.media_url && post.media_type === "video" ? (
        <VideoPreview uri={post.media_url} />
      ) : null}

      <View style={[ui.flexRow, { marginTop: 6 }]}>
        <IconButton
          name="heart-outline"
          label="Like · not available yet"
          onPress={() => unavailable("Likes")}
        />
        <IconButton
          name="chatbubble-outline"
          label="Comment · not available yet"
          onPress={() => unavailable("Comments")}
        />
        <TextLink
          label="Share"
          icon="share-outline"
          onPress={() => {
            if (post.visibility !== "public" && !post.circle_id) {
              Alert.alert(
                "Friends only",
                "This post is shared only with mutual friends.",
              );
              return;
            }
            Share.share({
              message: `${post.author.name} on Aeolia: ${post.body}`,
            }).catch(() => Alert.alert("Unable to share", "Please try again."));
          }}
        />
      </View>
    </View>
  );
}
function PostList({
  path,
  openPerson,
  circles,
  create,
  authorId,
}: {
  authorId?: number;
  path: string;
  openPerson: (id: number) => void;
  circles: Circle[];
  create: () => void;
}) {
  const r = useResource<Post[]>(path, []);
  const posts = authorId
    ? r.data.filter((p) => p.author.id === authorId)
    : r.data;
  return r.loading ? (
    <Skeleton />
  ) : r.error ? (
    <ErrorState message={r.error} onRetry={r.reload} />
  ) : posts.length ? (
    <>
      {posts.map((p) => (
        <PostCard
          key={p.id}
          post={p}
          circles={circles}
          openPerson={openPerson}
        />
      ))}
    </>
  ) : (
    <EmptyState
      icon="chatbubbles-outline"
      title="A conversation starts with you"
      body="There are no posts here yet. Share a thought or follow a circle."
      action={<Button label="Create a post" onPress={create} secondary />}
    />
  );
}
function Feed({
  tab,
  setTab,
  circles,
  openPerson,
  create,
}: {
  tab: FeedTab;
  setTab: (tab: FeedTab) => void;
  circles: Circle[];
  openPerson: (id: number) => void;
  create: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={[styles.muted, { marginBottom: 15 }]}>
        People, ideas and moments from your circles.
      </Text>
      <View style={ui.segment}>
        {(
          [
            ["for_you", "For you"],
            ["friends", "Friends"],
            ["circles", "Following circles"],
          ] as const
        ).map(([key, label]) => (
          <View key={key} style={{ flex: 1 }}>
            <Pill
              label={label}
              active={tab === key}
              onPress={() => setTab(key)}
            />
          </View>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={create}
        style={[styles.card, ui.between, { marginVertical: 16 }]}
      >
        <Text style={styles.muted}>What would you like to share?</Text>
        <Icon name="add-outline" />
      </Pressable>
      <PostList
        path={`/feed?tab=${tab}`}
        circles={circles}
        openPerson={openPerson}
        create={create}
      />
    </ScrollView>
  );
}
function ChatBubble({
  body,
  mine,
  label,
}: {
  body: string;
  mine: boolean;
  label?: string;
}) {
  return (
    <View style={[ui.bubble, mine ? ui.mine : ui.theirs]}>
      {label && (
        <Text style={[styles.muted, { marginBottom: 4 }]}>{label}</Text>
      )}
      <Text style={styles.text}>{body}</Text>
    </View>
  );
}
function Agent({
  me,
  aiKey,
  save,
}: {
  me: Person | null;
  aiKey: string;
  save: (values: Partial<Person>) => Promise<void>;
}) {
  const [note, setNote] = useState(me?.preference_note || "");
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<{ body: string; mine: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const list = useRef<ScrollView>(null);
  useEffect(() => {
    setNote(me?.preference_note || "");
  }, [me?.preference_note]);
  const submit = async () => {
    if (!input.trim() || busy) return;
    setBusy(true);
    setError("");
    const message = input.trim();
    try {
      const r = await api<{ reply: string }>(
        "/agent/reply",
        json("POST", { message, api_key: aiKey || undefined }),
      );
      setTurns((t) => [
        ...t,
        { body: message, mine: true },
        { body: r.reply, mine: false },
      ]);
      setInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <ScrollView
        ref={list}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.body, { paddingTop: 0 }]}
        onContentSizeChange={() => {
          if (turns.length) list.current?.scrollToEnd({ animated: true });
        }}
      >
        <View style={{ alignItems: "center", gap: 8, paddingBottom: 18 }}>
          <Avatar size={86} outfit={me?.outfit} uri={me?.avatar_url} />
          <Text style={styles.heading}>Learning your vibe</Text>
          <Text style={styles.muted}>
            Curious conversations. Brighter connections.
          </Text>
        </View>
        <View style={[ui.segment, { marginBottom: 20 }]}>
          <Pill label="Chat" active onPress={() => {}} />
          <Pill
            label="Agent voice"
            icon="mic-outline"
            onPress={() => unavailable("Agent voice")}
          />
          <Pill
            label="Practice"
            icon="pulse-outline"
            onPress={() => unavailable("Voice practice")}
          />
        </View>
        {turns.length ? (
          turns.map((t, i) => <ChatBubble key={i} {...t} />)
        ) : (
          <ChatBubble
            body="What kind of people would you like to meet? Tell me about your interests, or a conversation you'd love to have."
            mine={false}
            label="My agent"
          />
        )}
        <View style={[ui.notice, { marginVertical: 18 }]}>
          <Icon name="lock-closed-outline" size={18} />
          <View style={{ flex: 1 }}>
            <Text style={ui.rowTitle}>Your preferences are private.</Text>
            <Text style={styles.muted}>
              You're always in control of what your agent remembers.
            </Text>
          </View>
        </View>
        <View style={[styles.card, { gap: 12 }]}>
          <View style={ui.between}>
            <Text style={[ui.rowTitle, { flex: 1 }]}>
              What your agent remembers
            </Text>
            <TextLink
              label={editing ? "Cancel" : "Edit"}
              onPress={() => {
                setEditing(!editing);
                setNote(me?.preference_note || "");
              }}
            />
          </View>
          {editing ? (
            <>
              <Field
                multiline
                value={note}
                onChangeText={setNote}
                placeholder="I like curious people who enjoy cozy games…"
                style={{ minHeight: 100, textAlignVertical: "top" }}
              />
              <Button
                label="Save preferences"
                loading={busy}
                onPress={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await save({ preference_note: note });
                    setEditing(false);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </>
          ) : (
            <Text style={styles.text}>
              {me?.preference_note ||
                "No preferences saved yet. Add a note to help your agent get to know you."}
            </Text>
          )}
          <View style={ui.tags}>
            {me?.interests.map((x) => (
              <Pill key={x} label={x} />
            ))}
          </View>
          <Text style={styles.muted}>
            Your agent uses these to suggest people and conversations.
          </Text>
        </View>
        {!!error && (
          <Text
            accessibilityRole="alert"
            style={[styles.text, { color: c.rose, marginTop: 12 }]}
          >
            {error}
          </Text>
        )}
      </ScrollView>
      <View style={ui.composer}>
        <Field
          value={input}
          onChangeText={setInput}
          placeholder="Message your agent…"
          multiline
          style={ui.messageInput}
        />
        <IconButton
          name={busy ? "hourglass-outline" : "send"}
          label="Send to agent"
          disabled={busy || !input.trim()}
          onPress={submit}
        />
      </View>
    </>
  );
}
// The prototype has four demo accounts; only mutual friends can be chatted with.
function useFriends() {
  const [friends, setFriends] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const people = await Promise.all(
        [2, 3, 4].map((id) => api<Person>(`/users/${id}`)),
      );
      setFriends(people.filter((p) => p.mutual));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { friends, loading, error, load };
}

type Convo =
  | { key: string; kind: "friend"; person: Person; name: string }
  | { key: string; kind: "group"; group: ChatGroup; name: string };

function Chats({
  me,
  chats,
  openAgent,
  openChat,
  openGroup,
  openPeople,
}: {
  me: Person | null;
  chats: ChatsStore;
  openAgent: () => void;
  openChat: (p: Person) => void;
  openGroup: (g: ChatGroup) => void;
  openPeople: () => void;
}) {
  const [query, setQuery] = useState("");
  const { friends, loading, error, load } = useFriends();
  // Friends and groups share one conversation list, pinned first, newest actions kept local.
  const items: Convo[] = [
    ...friends.map(
      (p): Convo => ({
        key: friendKey(p.id),
        kind: "friend",
        person: p,
        name: p.name,
      }),
    ),
    ...chats.prefs.groups.map(
      (g): Convo => ({ key: groupKey(g.id), kind: "group", group: g, name: g.name }),
    ),
  ].filter((i) => !chats.isHidden(i.key));
  const order = chats.sortKeys(items.map((i) => i.key));
  const sorted = order
    .map((k) => items.find((i) => i.key === k))
    .filter((i): i is Convo => !!i)
    .filter((i) => i.name.toLowerCase().includes(query.toLowerCase()));

  const rowActions = (item: Convo, index: number) => {
    const pinned = chats.isPinned(item.key);
    const prev = sorted[index - 1];
    const next = sorted[index + 1];
    const canUp = prev && chats.isPinned(prev.key) === pinned;
    const canDown = next && chats.isPinned(next.key) === pinned;
    const buttons: {
      text: string;
      style?: "cancel" | "destructive";
      onPress?: () => void;
    }[] = [
      { text: pinned ? "Unpin" : "Pin to top", onPress: () => chats.togglePin(item.key) },
    ];
    if (canUp) buttons.push({ text: "Move up", onPress: () => chats.swap(item.key, prev.key) });
    if (canDown)
      buttons.push({ text: "Move down", onPress: () => chats.swap(item.key, next.key) });
    if (item.kind === "group")
      buttons.push({
        text: "Delete group",
        style: "destructive",
        onPress: () =>
          Alert.alert("Delete this group?", `"${item.name}" will be removed for you.`, [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: () => chats.deleteGroup(item.group.id),
            },
          ]),
      });
    else
      buttons.push({
        text: "Remove from chats",
        style: "destructive",
        onPress: () => chats.remove(item.key),
      });
    buttons.push({ text: "Cancel", style: "cancel" });
    Alert.alert(item.name, pinned ? "Pinned conversation" : undefined, buttons);
  };

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.body}
    >
      <View style={ui.between}>
        <Text style={styles.title}>Chats</Text>
        <IconButton
          name="people-outline"
          label="Friends and groups"
          onPress={openPeople}
        />
      </View>
      <Field
        value={query}
        onChangeText={setQuery}
        placeholder="Search conversations…"
        style={{ marginTop: 16, backgroundColor: "#EFF3F1", borderWidth: 0 }}
      />
      <Pressable
        accessibilityRole="button"
        onPress={openAgent}
        style={[
          styles.card,
          ui.flexRow,
          { backgroundColor: "#F0F6F3", alignItems: "center", borderWidth: 0 },
        ]}
      >
        <Avatar size={55} outfit={me?.outfit} uri={me?.avatar_url} />
        <View style={{ flex: 1 }}>
          <Text style={ui.rowTitle}>My agent</Text>
          <Text style={styles.muted}>
            Learning, planning, and exploring together.
          </Text>
        </View>
        <View style={{ alignItems: "center", gap: 5 }}>
          <Icon name="pin" size={15} />
          <Text style={styles.muted}>Pinned</Text>
        </View>
      </Pressable>
      {loading ? (
        <Skeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : sorted.length ? (
        sorted.map((item, index) => (
          <Pressable
            accessibilityRole="button"
            key={item.key}
            accessibilityLabel={`Chat: ${item.name}`}
            onPress={() =>
              item.kind === "friend"
                ? openChat(item.person)
                : openGroup(item.group)
            }
            onLongPress={() => rowActions(item, index)}
            style={ui.personRow}
          >
            {item.kind === "friend" ? (
              <Avatar outfit={item.person.outfit} uri={item.person.avatar_url} />
            ) : (
              <GroupAvatar />
            )}
            <View style={{ flex: 1 }}>
              <View style={ui.flexRow}>
                {chats.isPinned(item.key) && (
                  <Icon name="pin" size={12} color={c.teal} />
                )}
                <Text style={ui.rowTitle}>{item.name}</Text>
              </View>
              {item.kind === "friend" ? (
                <ChatPreview person={item.person} />
              ) : (
                <GroupPreview group={item.group} chats={chats} />
              )}
            </View>
            <IconButton
              name="ellipsis-horizontal"
              label={`Options for ${item.name}`}
              onPress={() => rowActions(item, index)}
            />
          </Pressable>
        ))
      ) : (
        <EmptyState
          icon="chatbubbles-outline"
          title={query ? "No matching conversations" : "No conversations yet"}
          body="Tap the people icon to find friends or start a group."
          action={
            <Button label="Friends & groups" secondary onPress={openPeople} />
          }
        />
      )}
    </ScrollView>
  );
}
function GroupAvatar({ size = 52 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#E4EFE9",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name="people" size={size * 0.5} color={c.teal} />
    </View>
  );
}
function ChatPreview({ person }: { person: Person }) {
  const r = useResource<Message[]>(`/messages/${person.id}`, []);
  const last = r.data[r.data.length - 1];
  return (
    <Text style={styles.muted} numberOfLines={1}>
      {r.loading
        ? "Loading conversation…"
        : r.error
          ? "Tap to open conversation"
          : last?.body || `Say hello to ${person.name}`}
    </Text>
  );
}
function GroupPreview({
  group,
  chats,
}: {
  group: ChatGroup;
  chats: ChatsStore;
}) {
  const messages = chats.prefs.groupMessages[group.id] || [];
  const last = messages[messages.length - 1];
  return (
    <Text style={styles.muted} numberOfLines={1}>
      {last?.body ||
        `${group.memberIds.length + 1} people · say something`}
    </Text>
  );
}
function People({
  chats,
  back,
  openChat,
  openGroup,
  openPerson,
}: {
  chats: ChatsStore;
  back: () => void;
  openChat: (p: Person) => void;
  openGroup: (g: ChatGroup) => void;
  openPerson: (id: number) => void;
}) {
  const { friends, loading, error, load } = useFriends();
  const [friendsOpen, setFriendsOpen] = useState(true);
  const [groupsOpen, setGroupsOpen] = useState(true);
  const [add, setAdd] = useState(false);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const nameOf = (id: number) => friends.find((f) => f.id === id)?.name || `#${id}`;
  return (
    <>
      <Header
        title="People"
        onBack={back}
        right={
          <IconButton
            name="person-add-outline"
            label="Add by ID"
            onPress={() => setAdd(!add)}
          />
        }
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.body}
      >
        {add && (
          <View style={[styles.card, { marginBottom: 4 }]}>
            <Text style={[ui.rowTitle, { marginBottom: 8 }]}>
              Add by Aeolia ID
            </Text>
            <Field
              value={handle}
              onChangeText={setHandle}
              placeholder="Aeolia ID"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button
              label="Find person"
              loading={busy}
              disabled={!handle.trim()}
              onPress={async () => {
                setBusy(true);
                try {
                  const p = await api<Person>(
                    `/users/by-id/${encodeURIComponent(handle.trim().replace(/^@/, ""))}`,
                  );
                  openPerson(p.id);
                } catch (e) {
                  Alert.alert(
                    "Could not find this person",
                    e instanceof Error ? e.message : String(e),
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: friendsOpen }}
          onPress={() => setFriendsOpen(!friendsOpen)}
          style={[ui.group, { marginTop: add ? 16 : 0 }]}
        >
          <Icon name="people" />
          <Text style={[ui.rowTitle, { flex: 1 }]}>
            Friends · {friends.length}
          </Text>
          <Icon
            name={friendsOpen ? "chevron-down" : "chevron-forward"}
            size={18}
          />
        </Pressable>
        {friendsOpen && (
          <>
            {loading ? (
              <Skeleton />
            ) : error ? (
              <ErrorState message={error} onRetry={load} />
            ) : friends.length ? (
              friends.map((p) => (
                <Pressable
                  accessibilityRole="button"
                  key={p.id}
                  accessibilityLabel={`Chat with ${p.name}`}
                  onPress={() => openChat(p)}
                  style={ui.personRow}
                >
                  <Avatar outfit={p.outfit} uri={p.avatar_url} />
                  <View style={{ flex: 1 }}>
                    <Text style={ui.rowTitle}>{p.name}</Text>
                    <Text style={styles.muted}>@{p.handle}</Text>
                  </View>
                  <Icon name="chatbubble-outline" size={16} />
                </Pressable>
              ))
            ) : (
              <EmptyState
                icon="people-outline"
                title="Your people will be here"
                body="Follow each other to start a conversation."
              />
            )}
          </>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: groupsOpen }}
          onPress={() => setGroupsOpen(!groupsOpen)}
          style={ui.group}
        >
          <Icon name="people-circle-outline" />
          <Text style={[ui.rowTitle, { flex: 1 }]}>
            Groups · {chats.prefs.groups.length}
          </Text>
          <Icon
            name={groupsOpen ? "chevron-down" : "chevron-forward"}
            size={18}
          />
        </Pressable>
        {groupsOpen && (
          <>
            <TextLink
              label={creating ? "Close" : "New group"}
              icon="add-circle-outline"
              onPress={() => {
                setCreating(!creating);
                setPicked([]);
                setGroupName("");
              }}
            />
            {creating && (
              <View style={[styles.card, { marginTop: 12 }]}>
                <Field
                  value={groupName}
                  onChangeText={setGroupName}
                  placeholder="Group name"
                />
                <Text style={[styles.muted, { marginVertical: 8 }]}>
                  Choose members
                </Text>
                {friends.map((p) => {
                  const on = picked.includes(p.id);
                  return (
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      key={p.id}
                      onPress={() =>
                        setPicked((ids) =>
                          on ? ids.filter((x) => x !== p.id) : [...ids, p.id],
                        )
                      }
                      style={[ui.flexRow, { paddingVertical: 10 }]}
                    >
                      <Icon
                        name={on ? "checkbox" : "square-outline"}
                        color={on ? c.teal : c.muted}
                      />
                      <Avatar size={34} outfit={p.outfit} uri={p.avatar_url} />
                      <Text style={[ui.rowTitle, { flex: 1 }]}>{p.name}</Text>
                    </Pressable>
                  );
                })}
                <Button
                  label="Create group"
                  disabled={!groupName.trim() || picked.length < 2}
                  onPress={() => {
                    const g = chats.createGroup(groupName, picked);
                    setCreating(false);
                    openGroup(g);
                  }}
                />
                {picked.length < 2 && (
                  <Text style={[styles.muted, { marginTop: 8 }]}>
                    Pick at least two people.
                  </Text>
                )}
              </View>
            )}
            {chats.prefs.groups.length ? (
              chats.prefs.groups.map((g) => (
                <Pressable
                  accessibilityRole="button"
                  key={g.id}
                  accessibilityLabel={`Open group ${g.name}`}
                  onPress={() => openGroup(g)}
                  style={ui.personRow}
                >
                  <GroupAvatar size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={ui.rowTitle}>{g.name}</Text>
                    <Text style={styles.muted} numberOfLines={1}>
                      You · {g.memberIds.map(nameOf).join(", ")}
                    </Text>
                  </View>
                  <Icon name="chevron-forward" size={16} />
                </Pressable>
              ))
            ) : (
              <Text style={[styles.muted, { padding: 18 }]}>
                No groups yet. Create one to chat with a few friends at once.
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}
function GroupConversation({
  group,
  me,
  chats,
  back,
}: {
  group: ChatGroup;
  me: Person | null;
  chats: ChatsStore;
  back: () => void;
}) {
  const [members, setMembers] = useState<Person[]>([]);
  const [draft, setDraft] = useState("");
  const list = useRef<ScrollView>(null);
  useEffect(() => {
    Promise.all(
      group.memberIds.map((id) => api<Person>(`/users/${id}`).catch(() => null)),
    ).then((people) =>
      setMembers(people.filter((p): p is Person => !!p)),
    );
  }, [group.memberIds]);
  const messages = chats.prefs.groupMessages[group.id] || [];
  const senderName = (id: number) =>
    id === me?.id ? "You" : members.find((m) => m.id === id)?.name || `#${id}`;
  const send = () => {
    if (!draft.trim() || !me) return;
    chats.sendGroupMessage(group.id, me.id, draft.trim());
    setDraft("");
  };
  return (
    <>
      <View style={ui.chatHeader}>
        <IconButton name="chevron-back" label="Back to chats" onPress={back} />
        <View style={[ui.flexRow, { flex: 1, alignItems: "center", gap: 8 }]}>
          <GroupAvatar size={34} />
          <View style={{ flexShrink: 1 }}>
            <Text style={ui.rowTitle}>{group.name}</Text>
            <Text style={styles.muted} numberOfLines={1}>
              You, {members.map((m) => m.name).join(", ")}
            </Text>
          </View>
        </View>
      </View>
      <View
        style={[
          ui.notice,
          { marginHorizontal: 20, marginTop: 8, marginBottom: 10 },
        ]}
      >
        <Icon name="people" size={20} />
        <View style={{ flex: 1 }}>
          <Text style={ui.rowTitle}>Group chat</Text>
          <Text style={styles.muted}>
            Messages are saved on this device in the prototype.
          </Text>
        </View>
      </View>
      <ScrollView
        ref={list}
        contentContainerStyle={styles.body}
        onContentSizeChange={() =>
          list.current?.scrollToEnd({ animated: true })
        }
      >
        {messages.length ? (
          messages.map((m) => (
            <View key={m.id}>
              {m.senderId !== me?.id && (
                <Text style={[styles.muted, { marginLeft: 6, marginBottom: 2 }]}>
                  {senderName(m.senderId)}
                </Text>
              )}
              <ChatBubble mine={m.senderId === me?.id} body={m.body} />
            </View>
          ))
        ) : (
          <EmptyState
            icon="chatbubbles-outline"
            title={`Start ${group.name}`}
            body="Say hello to everyone at once."
          />
        )}
      </ScrollView>
      <View style={ui.composer}>
        <Field
          value={draft}
          onChangeText={setDraft}
          multiline
          placeholder={`Message ${group.name}…`}
          style={ui.messageInput}
        />
        <IconButton
          name="send"
          label="Send message"
          disabled={!draft.trim()}
          onPress={send}
        />
      </View>
    </>
  );
}
function Conversation({
  person,
  me,
  back,
  openProfile,
  startCall,
  openGameRoom,
  reason,
}: {
  person: Person;
  me: Person | null;
  back: () => void;
  openProfile: () => void;
  startCall: (kind: "voice" | "video") => void;
  openGameRoom: (roomId: number, join: boolean) => void;
  reason?: string;
}) {
  const r = useResource<Message[]>(`/messages/${person.id}`, []);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const [recording, setRecording] = useState(false);
  const [compose, setCompose] = useState<"game" | "meetup" | null>(null);
  const [detail, setDetail] = useState("");
  const [playSheet, setPlaySheet] = useState(false);
  const list = useRef<ScrollView>(null);
  const invite = (kind: "uno" | "draw_guess") =>
    Alert.alert(
      `Invite ${person.name} to ${GAME_LABEL[kind]}?`,
      "A quick game for the two of you.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Invite",
          onPress: async () => {
            setPlaySheet(false);
            setBusy(true);
            setError("");
            try {
              await api<{ room_id: number }>(
                "/games/rooms",
                json("POST", { kind, guest_id: person.id }),
              );
              await r.reload();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  const post = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      await api<{ id: number }>("/messages", json("POST", payload));
      await r.reload();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    if (!draft.trim() || busy) return;
    if (await post({ recipient_id: person.id, body: draft.trim() })) setDraft("");
  };
  const sendUpload = async (uri: string, mime: string) => {
    setBusy(true);
    setError("");
    try {
      const media = await uploadMedia(uri, mime);
      await api<{ id: number }>(
        "/messages",
        json("POST", { recipient_id: person.id, media_id: media.id }),
      );
      await r.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const imageMime = (asset: ImagePicker.ImagePickerAsset) => {
    const extension = asset.uri.split(".").pop()?.toLowerCase();
    return (
      asset.mimeType ||
      (extension === "png"
        ? "image/png"
        : extension === "heic"
          ? "image/heic"
          : "image/jpeg")
    );
  };
  const pickPhoto = async () => {
    setPanel(false);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Allow photo access to share an image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
    });
    if (result.canceled) return;
    await sendUpload(result.assets[0].uri, imageMime(result.assets[0]));
  };
  const takePhoto = async () => {
    setPanel(false);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Allow camera access to take a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    if (result.canceled) return;
    await sendUpload(result.assets[0].uri, imageMime(result.assets[0]));
  };
  const pickFile = async () => {
    setPanel(false);
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled) return;
    const file = result.assets[0];
    setBusy(true);
    setError("");
    try {
      const media = await uploadMedia(
        file.uri,
        file.mimeType || "application/octet-stream",
      );
      await api<{ id: number }>(
        "/messages",
        json("POST", {
          recipient_id: person.id,
          kind: "file",
          body: file.name || "File",
          media_id: media.id,
        }),
      );
      await r.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const sendInvite = async () => {
    if (!detail.trim() || !compose || busy) return;
    if (
      await post({ recipient_id: person.id, kind: compose, body: detail.trim() })
    ) {
      setDetail("");
      setCompose(null);
    }
  };
  return (
    <>
      <View style={ui.chatHeader}>
        <IconButton name="chevron-back" label="Back to chats" onPress={back} />
        <Pressable
          accessibilityRole="button"
          onPress={openProfile}
          style={[ui.flexRow, { flex: 1, alignItems: "center", gap: 8 }]}
        >
          <Avatar size={34} outfit={person.outfit} uri={person.avatar_url} />
          <Text style={[ui.rowTitle, { flexShrink: 1 }]}>{person.name}</Text>
        </Pressable>
        <IconButton
          name="call-outline"
          label="Voice call"
          onPress={() => startCall("voice")}
        />
        <IconButton
          name="videocam-outline"
          label="Video call"
          onPress={() => startCall("video")}
        />
      </View>
      <View
        style={[
          ui.notice,
          { marginHorizontal: 20, marginTop: 8, marginBottom: 10 },
        ]}
      >
        <Avatar size={30} />
        <View style={{ flex: 1 }}>
          <Text style={ui.rowTitle}>
            {reason ? "Introduced by your agents" : "You’re connected"}
          </Text>
          <Text style={styles.muted}>
            {reason || "You follow each other. Take it from here."}
          </Text>
        </View>
      </View>
      <ScrollView
        ref={list}
        contentContainerStyle={styles.body}
        onContentSizeChange={() =>
          list.current?.scrollToEnd({ animated: true })
        }
      >
        {r.loading ? (
          <Skeleton />
        ) : r.error ? (
          <ErrorState message={r.error} onRetry={r.reload} />
        ) : r.data.length ? (
          r.data.map((m) => {
            const mine = m.sender_id === me?.id;
            if (m.kind === "image" && m.media_url)
              return <ChatImageBubble key={m.id} url={m.media_url} mine={mine} />;
            if (m.kind === "voice" && m.media_url)
              return <VoiceBubble key={m.id} url={m.media_url} mine={mine} />;
            if (m.kind === "file")
              return (
                <FileBubble
                  key={m.id}
                  name={m.body || "File"}
                  mine={mine}
                  onPress={() =>
                    Alert.alert(m.body || "File", "File preview isn’t wired in the prototype.")
                  }
                />
              );
            if (m.kind === "game" || m.kind === "meetup")
              return (
                <InviteBubble key={m.id} kind={m.kind} body={m.body} mine={mine} />
              );
            if (m.kind === "game_invite" && m.game_room_id)
              return (
                <InviteCard
                  key={m.id}
                  gameLabel={GAME_LABEL[m.body] || "a game"}
                  who={person.name}
                  mine={mine}
                  onOpen={() => openGameRoom(m.game_room_id!, !mine)}
                />
              );
            return <ChatBubble key={m.id} mine={mine} body={m.body} />;
          })
        ) : (
          <EmptyState
            icon="chatbubble-outline"
            title={`Say hello to ${person.name}`}
            body="Every good friendship starts somewhere."
          />
        )}
        {busy && <Text style={styles.muted}>Sending…</Text>}
        {!!error && (
          <Text
            accessibilityRole="alert"
            style={[styles.text, { color: c.rose }]}
          >
            {error}
          </Text>
        )}
      </ScrollView>
      {compose && (
        <View style={ui.inviteComposer}>
          <View style={ui.flexRow}>
            <Icon
              name={compose === "game" ? "game-controller-outline" : "calendar-outline"}
              color={c.teal}
            />
            <Text style={[ui.rowTitle, { flex: 1 }]}>
              {compose === "game" ? "Game invite" : "Meeting plan"}
            </Text>
            <IconButton
              name="close"
              label="Cancel"
              onPress={() => {
                setCompose(null);
                setDetail("");
              }}
            />
          </View>
          <Field
            value={detail}
            onChangeText={setDetail}
            placeholder={
              compose === "game"
                ? "Which game? e.g. Catan tonight at 8"
                : "What’s the plan? e.g. Coffee Sat 10am, Blue Bottle"
            }
            style={{ marginTop: 8, marginBottom: 0 }}
          />
          <Button
            label={compose === "game" ? "Send game invite" : "Send meeting plan"}
            loading={busy}
            disabled={!detail.trim()}
            onPress={sendInvite}
          />
        </View>
      )}
      {recording ? (
        <VoiceRecorder
          onCancel={() => setRecording(false)}
          onDone={(uri) => {
            setRecording(false);
            sendUpload(uri, "audio/mp4");
          }}
        />
      ) : (
        <>
          {emoji && (
            <View style={ui.emojiRow}>
              {EMOJIS.map((e) => (
                <Pressable
                  key={e}
                  accessibilityRole="button"
                  accessibilityLabel={`Insert ${e}`}
                  onPress={() => setDraft((d) => d + e)}
                  style={ui.emojiKey}
                >
                  <Text style={{ fontSize: 26 }}>{e}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <View style={ui.composer}>
            <IconButton
              name="mic-outline"
              label="Record voice message"
              disabled={busy || !!r.error}
              onPress={() => {
                setPanel(false);
                setEmoji(false);
                Keyboard.dismiss();
                setRecording(true);
              }}
            />
            <Field
              value={draft}
              onChangeText={setDraft}
              multiline
              placeholder={`Message ${person.name}…`}
              style={ui.messageInput}
              onFocus={() => {
                setPanel(false);
                setEmoji(false);
              }}
            />
            <IconButton
              name="happy-outline"
              label="Emoji"
              onPress={() => {
                Keyboard.dismiss();
                setPanel(false);
                setEmoji((v) => !v);
              }}
            />
            {draft.trim() ? (
              <IconButton
                name={busy ? "hourglass-outline" : "send"}
                label="Send message"
                disabled={busy || !!r.error}
                onPress={send}
              />
            ) : (
              <IconButton
                name="add-circle-outline"
                label="More: album, camera, file, game, meeting"
                disabled={busy}
                onPress={() => {
                  Keyboard.dismiss();
                  setEmoji(false);
                  setPanel((v) => !v);
                }}
              />
            )}
          </View>
          {panel && (
            <View style={ui.tray}>
              {(
                [
                  { icon: "images-outline", label: "Album", onPress: pickPhoto },
                  { icon: "camera-outline", label: "Camera", onPress: takePhoto },
                  { icon: "document-outline", label: "File", onPress: pickFile },
                  {
                    icon: "game-controller-outline",
                    label: "Play",
                    onPress: () => {
                      setPanel(false);
                      setPlaySheet(true);
                    },
                  },
                  {
                    icon: "calendar-outline",
                    label: "Meetup plan",
                    onPress: () => {
                      setPanel(false);
                      setDetail("");
                      setCompose("meetup");
                    },
                  },
                ] as const
              ).map((t) => (
                <Pressable
                  key={t.label}
                  accessibilityRole="button"
                  accessibilityLabel={t.label}
                  onPress={t.onPress}
                  style={ui.trayTile}
                >
                  <View style={ui.trayIcon}>
                    <Icon name={t.icon} size={26} color="#4A4A4A" />
                  </View>
                  <Text style={ui.trayLabel}>{t.label}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}
      <BottomSheet
        visible={playSheet}
        title="Play together"
        close={() => setPlaySheet(false)}
      >
        {(
          [
            {
              kind: "draw_guess",
              icon: "brush-outline",
              name: "Draw & Guess",
              body: "Draw it. Let them guess.",
            },
            {
              kind: "uno",
              icon: "albums-outline",
              name: "UNO",
              body: "Classic card game.",
            },
            {
              kind: null,
              icon: "help-circle-outline",
              name: "Questions",
              body: "Get to know each other · later",
            },
          ] as const
        ).map((x) => (
          <Pressable
            key={x.name}
            accessibilityRole="button"
            disabled={!x.kind}
            onPress={() => x.kind && invite(x.kind)}
            style={({ pressed }) => [
              ui.createRow,
              !x.kind && { opacity: 0.45 },
              pressed && x.kind && { backgroundColor: c.mint },
            ]}
          >
            <View style={ui.iconCircle}>
              <Icon name={x.icon} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={ui.rowTitle}>{x.name}</Text>
              <Text style={styles.muted}>{x.body}</Text>
            </View>
            {x.kind && <Icon name="chevron-forward" size={16} />}
          </Pressable>
        ))}
      </BottomSheet>
    </>
  );
}
function PlayerSlot({ person, cards }: { person: Person; cards: number }) {
  return (
    <View style={{ alignItems: "center", gap: 6, flex: 1 }}>
      <Avatar size={56} outfit={person.outfit} uri={person.avatar_url} />
      <Text style={ui.rowTitle} numberOfLines={1}>
        {person.name}
      </Text>
      <Text style={styles.muted}>{cards} cards</Text>
    </View>
  );
}
function RoomChat({ otherId, me }: { otherId: number; me: Person | null }) {
  const msgs = useResource<Message[]>(`/messages/${otherId}`, []);
  const [draft, setDraft] = useState("");
  const list = useRef<ScrollView>(null);
  const send = async () => {
    if (!draft.trim()) return;
    const body = draft.trim();
    setDraft("");
    try {
      await api("/messages", json("POST", { recipient_id: otherId, body }));
      await msgs.reload();
    } catch {
      setDraft(body);
    }
  };
  return (
    <>
      <ScrollView
        ref={list}
        contentContainerStyle={{ padding: 20, paddingTop: 10 }}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
      >
        {msgs.data.slice(-20).map((m) => {
          const mine = m.sender_id === me?.id;
          if (m.kind === "image" && m.media_url)
            return <ChatImageBubble key={m.id} url={m.media_url} mine={mine} />;
          if (m.kind === "voice" && m.media_url)
            return <VoiceBubble key={m.id} url={m.media_url} mine={mine} />;
          if (m.kind === "text" || !m.kind)
            return <ChatBubble key={m.id} mine={mine} body={m.body} />;
          return null;
        })}
      </ScrollView>
      <View style={ui.composer}>
        <Field
          value={draft}
          onChangeText={setDraft}
          multiline
          placeholder="Say something…"
          style={ui.messageInput}
        />
        <IconButton
          name="send"
          label="Send message"
          disabled={!draft.trim()}
          onPress={send}
        />
      </View>
    </>
  );
}
function GameRoom({
  roomId,
  me,
  back,
  startCall,
}: {
  roomId: number;
  me: Person | null;
  back: () => void;
  startCall: (person: Person, kind: "voice" | "video") => void;
}) {
  const room = useResource<GameRoom | null>(`/games/rooms/${roomId}`, null);
  const data = room.data;
  const other = data ? (data.host.id === me?.id ? data.guest : data.host) : null;
  return (
    <>
      <View style={ui.chatHeader}>
        <IconButton name="chevron-back" label="Leave game" onPress={back} />
        <Text style={[ui.rowTitle, { flex: 1, textAlign: "center" }]}>
          {data ? GAME_LABEL[data.kind] : "Game"}
        </Text>
        {other ? (
          <>
            <IconButton
              name="call-outline"
              label="Voice call"
              onPress={() => startCall(other, "voice")}
            />
            <IconButton
              name="videocam-outline"
              label="Video call"
              onPress={() => startCall(other, "video")}
            />
          </>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>
      {room.loading || !data || !other ? (
        <Skeleton />
      ) : data.kind === "draw_guess" ? (
        <DrawGame roomId={data.id} me={me} host={data.host} guest={data.guest} />
      ) : (
        <>
          <View style={ui.gamePlayers}>
            <PlayerSlot person={data.host} cards={7} />
            <PlayerSlot person={data.guest} cards={7} />
          </View>
          <View style={ui.gameArea}>
            <Icon name="albums-outline" size={42} color={c.muted} />
            <Text style={styles.heading}>
              {data.status === "inviting"
                ? `Waiting for ${other.name} to join…`
                : `${GAME_LABEL[data.kind]} room is ready`}
            </Text>
            <Text style={[styles.muted, { textAlign: "center" }]}>
              Live UNO arrives next. For now, talk while you get set up.
            </Text>
          </View>
          <RoomChat otherId={other.id} me={me} />
        </>
      )}
    </>
  );
}
function CallScreen({
  person,
  kind,
  end,
}: {
  person: Person;
  kind: "voice" | "video";
  end: () => void;
}) {
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(kind === "video");
  return (
    <View style={ui.call}>
      <View style={{ alignItems: "center", gap: 16, marginTop: 40 }}>
        <Avatar size={128} outfit={person.outfit} uri={person.avatar_url} />
        <Text style={[styles.title, { color: c.white }]}>{person.name}</Text>
        <Text style={{ color: "#C9DBDA", fontSize: 15 }}>
          {kind === "video" ? "Video call" : "Voice call"} · Calling…
        </Text>
        <Text style={{ color: "#8FA9A8", textAlign: "center", paddingHorizontal: 40 }}>
          Live calls aren’t connected in this prototype.
        </Text>
      </View>
      <View style={ui.callControls}>
        <CallButton
          icon={muted ? "mic-off" : "mic"}
          label={muted ? "Unmute" : "Mute"}
          active={muted}
          onPress={() => setMuted(!muted)}
        />
        <CallButton
          icon="call"
          label="End call"
          danger
          onPress={end}
        />
        <CallButton
          icon={speaker ? "volume-high" : "volume-medium"}
          label="Speaker"
          active={speaker}
          onPress={() => setSpeaker(!speaker)}
        />
      </View>
    </View>
  );
}
function CallButton({
  icon,
  label,
  onPress,
  active,
  danger,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        ui.callButton,
        danger && { backgroundColor: c.rose },
        active && !danger && { backgroundColor: c.teal },
      ]}
    >
      <Icon name={icon} size={26} color={c.white} />
    </Pressable>
  );
}
function Events({
  create,
  openGame,
}: {
  create: () => void;
  openGame: () => void;
}) {
  const r = useResource<Event[]>("/events", []);
  const [filter, setFilter] = useState<"all" | "meetup" | "game">("all");
  const events = r.data.filter((e) => filter === "all" || e.kind === filter);
  return (
    <ScrollView
      contentContainerStyle={styles.body}
      refreshControl={
        <RefreshControl refreshing={r.loading} onRefresh={r.reload} />
      }
    >
      <Text style={[styles.heading, { textAlign: "center" }]}>
        Real connections, in any form.
      </Text>
      <Text
        style={[
          styles.muted,
          { textAlign: "center", marginTop: 5, marginBottom: 20 },
        ]}
      >
        Meet up in person or join a game online.
      </Text>
      <View style={ui.segment}>
        {(
          [
            ["all", "All"],
            ["meetup", "Meetup plans"],
            ["game", "Game rooms"],
          ] as const
        ).map(([key, label]) => (
          <View key={key} style={{ flex: 1 }}>
            <Pill
              label={label}
              active={filter === key}
              onPress={() => setFilter(key)}
            />
          </View>
        ))}
      </View>
      <View style={[ui.between, { marginVertical: 12 }]}>
        <Text style={styles.muted}>Plans from your community</Text>
        <TextLink label="Create event" icon="add-outline" onPress={create} />
      </View>
      {r.loading ? (
        <Skeleton />
      ) : r.error ? (
        <ErrorState message={r.error} onRetry={r.reload} />
      ) : events.length ? (
        events.map((e) => (
          <View key={e.id} style={[styles.card, { marginBottom: 16, gap: 14 }]}>
            <View style={[ui.flexRow, { alignItems: "stretch" }]}>
              <View
                style={[
                  ui.eventCover,
                  { backgroundColor: e.kind === "game" ? c.mint : c.apricot },
                ]}
              >
                <Icon
                  name={
                    e.kind === "game"
                      ? "game-controller-outline"
                      : "cafe-outline"
                  }
                  size={42}
                  color={e.kind === "game" ? c.teal : c.orange}
                />
              </View>
              <View style={{ flex: 1, gap: 8 }}>
                <View style={{ alignSelf: "flex-start" }}>
                  <Pill
                    label={e.kind === "game" ? "Online game" : "In person"}
                    icon={
                      e.kind === "game"
                        ? "game-controller-outline"
                        : "location-outline"
                    }
                  />
                </View>
                <Text style={styles.heading}>{e.title}</Text>
                <View style={ui.meta}>
                  <Icon name="location-outline" size={14} />
                  <Text style={[styles.muted, { flex: 1 }]}>
                    {e.kind === "game"
                      ? "Online"
                      : e.location || "Location to be arranged"}
                  </Text>
                </View>
                <View style={ui.meta}>
                  <Icon name="time-outline" size={14} />
                  <Text style={styles.muted}>Time to be arranged</Text>
                </View>
              </View>
            </View>
            <View style={ui.between}>
              <View style={[ui.flexRow, { alignItems: "center", flex: 1 }]}>
                <Avatar
                  size={30}
                  outfit={e.creator.outfit}
                  uri={e.creator.avatar_url}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.muted}>Created by</Text>
                  <Text style={ui.rowTitle}>{e.creator.name}</Text>
                </View>
              </View>
              <Button
                label={e.kind === "game" ? "View room" : "View plan"}
                secondary
                onPress={() =>
                  e.kind === "game"
                    ? openGame()
                    : Alert.alert(
                        e.title,
                        `Created by ${e.creator.name}\n${e.location || "Location to be arranged"}\n\nRSVP is not available yet.`,
                      )
                }
              />
            </View>
          </View>
        ))
      ) : (
        <EmptyState
          icon="calendar-outline"
          title="Good plans start here"
          body="Make time for your people. Plan a coffee or a game together."
          action={<Button label="Create an event" onPress={create} />}
        />
      )}
    </ScrollView>
  );
}
function Composer({
  kind,
  onBack,
  onCreated,
}: {
  kind: "game" | "meetup";
  circle: Circle | null;
  onBack: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const close = () => {
    if (busy) return;
    if (!title && !location) {
      onBack();
      return;
    }
    Alert.alert("Discard this draft?", "Your unsent changes will be lost.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: onBack },
    ]);
  };
  const publish = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(
        "/events",
        json("POST", {
          title: title.trim(),
          kind,
          location: kind === "meetup" ? location.trim() || null : null,
        }),
      );
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Header
        title={kind === "game" ? "Game room" : "Meetup plan"}
        onBack={close}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.body}
      >
        <View
          style={[
            ui.mediaPlaceholder,
            {
              minHeight: 130,
              backgroundColor: kind === "game" ? c.mint : c.apricot,
              marginBottom: 24,
            },
          ]}
        >
          <Icon
            name={kind === "game" ? "game-controller-outline" : "cafe-outline"}
            size={46}
          />
          <Text style={styles.heading}>
            {kind === "game"
              ? "Play brings us together."
              : "Make room for a real connection."}
          </Text>
        </View>
        <Text style={[ui.rowTitle, { marginBottom: 8 }]}>Plan name</Text>
        <Field
          value={title}
          onChangeText={setTitle}
          editable={!busy}
          maxLength={100}
          placeholder={
            kind === "game" ? "Draw & Guess tonight" : "Coffee & sketches"
          }
        />
        {kind === "meetup" && (
          <>
            <Text style={[ui.rowTitle, { marginBottom: 8 }]}>
              Broad location
            </Text>
            <Field
              value={location}
              onChangeText={setLocation}
              editable={!busy}
              maxLength={100}
              placeholder="A neighborhood or café (optional)"
            />
          </>
        )}
        <Text style={[styles.muted, { marginBottom: 24 }]}>
          {kind === "game"
            ? "Create a game plan. Live multiplayer and invitations are not available yet."
            : "Your plan will appear in Events. Scheduling and RSVP are not available yet."}
        </Text>
        <Button
          label="Create plan"
          disabled={!title.trim()}
          loading={busy}
          onPress={publish}
        />
        {!!error && (
          <Text
            accessibilityRole="alert"
            style={[styles.text, { color: c.rose, marginTop: 16 }]}
          >
            {error} Your draft is still here.
          </Text>
        )}
      </ScrollView>
    </>
  );
}
function SettingsRow({
  icon,
  title,
  detail,
  onPress,
}: {
  icon: IconName;
  title: string;
  detail?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.card, ui.flexRow, { alignItems: "center", minHeight: 56 }]}
    >
      <Icon name={icon} size={20} />
      <View style={{ flex: 1 }}>
        <Text style={styles.text}>{title}</Text>
        {detail && <Text style={styles.muted}>{detail}</Text>}
      </View>
      <Icon name="chevron-forward" size={16} />
    </Pressable>
  );
}
function ToggleRow({
  title,
  body,
  value,
  onChange,
  disabled,
}: {
  title: string;
  body: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <View style={[styles.card, ui.flexRow, { alignItems: "center" }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.text}>{title}</Text>
        <Text style={styles.muted}>{body}</Text>
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ true: c.teal }}
      />
    </View>
  );
}
const ui = StyleSheet.create({
  between: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  flexRow: { flexDirection: "row", gap: 10 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  avatarButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  online: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: c.teal,
    borderWidth: 2,
    borderColor: c.bg,
  },
  hero: {
    borderRadius: 18,
    backgroundColor: c.soft,
    flexDirection: "row",
    paddingHorizontal: 14,
    overflow: "hidden",
    gap: 8,
  },
  heroArt: { width: "35%", minHeight: 232 },
  shortcut: {
    flex: 1,
    minHeight: 122,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: 8,
  },
  rowTitle: { color: c.ink, fontSize: 14, fontWeight: "600" },
  textLink: {
    minHeight: 44,
    paddingHorizontal: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  notice: {
    borderRadius: 12,
    padding: 12,
    backgroundColor: c.mint,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  circleEmblem: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.mint,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  encounterHero: {
    height: 170,
    justifyContent: "center",
    alignItems: "center",
    gap: 28,
    marginBottom: 24,
    backgroundColor: c.mint,
    borderRadius: 18,
  },
  nav: {
    minHeight: 62,
    paddingTop: 8,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: c.line,
    backgroundColor: c.bg,
    flexDirection: "row",
  },
  tab: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  modal: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,34,39,0.32)",
  },
  sheet: {
    backgroundColor: c.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: "85%",
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#BDC9C9",
    marginBottom: 8,
  },
  createRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 13,
    padding: 10,
    marginBottom: 8,
  },
  photoGrid: { height: 245, flexDirection: "row", gap: 6, marginTop: 16 },
  photoPlaceholder: {
    borderRadius: 12,
    backgroundColor: c.mint,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    gap: 12,
    minHeight: 60,
  },
  meta: { flexDirection: "row", alignItems: "center", gap: 5 },
  outfit: {
    minWidth: 76,
    alignItems: "center",
    padding: 10,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: c.line,
    gap: 8,
  },
  network: { height: 300, position: "relative", marginVertical: 12 },
  centerNode: {
    position: "absolute",
    left: "36%",
    top: "35%",
    alignItems: "center",
    padding: 5,
    backgroundColor: c.bg,
    borderRadius: 50,
  },
  graphNode: {
    position: "absolute",
    alignItems: "center",
    minWidth: 54,
    minHeight: 54,
  },
  networkTopic: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  segment: {
    flexDirection: "row",
    backgroundColor: c.mint,
    borderRadius: 22,
    gap: 3,
  },
  post: { paddingVertical: 16, borderBottomWidth: 1, borderColor: c.line },
  postImage: { width: "100%", height: 220, borderRadius: 12, marginTop: 14 },
  bubble: { maxWidth: "88%", padding: 13, borderRadius: 16, marginBottom: 12 },
  mine: {
    alignSelf: "flex-end",
    backgroundColor: "#DDF0F0",
    borderBottomRightRadius: 5,
  },
  theirs: {
    alignSelf: "flex-start",
    backgroundColor: "#EEF1F2",
    borderBottomLeftRadius: 5,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: c.line,
    backgroundColor: c.bg,
  },
  messageInput: {
    flex: 1,
    marginBottom: 0,
    maxHeight: 120,
    borderRadius: 23,
    backgroundColor: c.white,
    borderWidth: 1,
    borderColor: c.line,
  },
  tray: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#F3F5F3",
    paddingVertical: 18,
    paddingHorizontal: 8,
  },
  trayTile: {
    width: "25%",
    alignItems: "center",
    paddingVertical: 12,
    gap: 8,
  },
  trayIcon: {
    width: 62,
    height: 62,
    borderRadius: 18,
    backgroundColor: c.white,
    alignItems: "center",
    justifyContent: "center",
  },
  trayLabel: { color: c.muted, fontSize: 12 },
  emojiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#F3F5F3",
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  emojiKey: {
    width: "12.5%",
    alignItems: "center",
    paddingVertical: 8,
  },
  group: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: c.mint,
    borderRadius: 12,
    padding: 12,
    marginTop: 20,
    minHeight: 48,
  },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: c.line,
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    minHeight: 56,
  },
  inviteComposer: {
    marginHorizontal: 14,
    marginBottom: 6,
    padding: 14,
    borderRadius: 16,
    backgroundColor: c.mint,
    gap: 6,
  },
  gamePlayers: {
    flexDirection: "row",
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderColor: c.line,
  },
  gameArea: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 28,
    paddingHorizontal: 30,
    backgroundColor: "#F3F5F3",
  },
  call: {
    flex: 1,
    backgroundColor: "#0C2A2E",
    justifyContent: "space-between",
    paddingBottom: 60,
    paddingTop: 30,
  },
  callControls: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 28,
  },
  callButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  eventCover: {
    width: 100,
    minHeight: 140,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaPlaceholder: {
    minHeight: 220,
    borderRadius: 18,
    backgroundColor: c.soft,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
});
