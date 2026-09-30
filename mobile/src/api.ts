export type Person = {
  age?: number | null;
  height_cm?: number | null;
  intent?: "friendship" | "dating";
  minimum_height_cm?: number | null;
  avatar_url?: string | null;
  profile?: {
    looking_for?: string;
    school?: string;
    ethnicity?: string;
    languages?: string[];
    lifestyle?: string[];
    music_artists?: string[];
    music_genres?: string[];
    music_url?: string;
    prompts?: { question: string; answer: string }[];
  };
  id: number;
  handle: string;
  name: string;
  city: string;
  job: string;
  bio: string;
  interests: string[];
  outfit: string;
  mutual?: boolean;
  agent_discoverable?: boolean;
  agent_chat_allowed?: boolean;
  preference_note?: string;
  location?: { latitude: number; longitude: number; radius_km: number } | null;
};
export type Circle = {
  id: number;
  name: string;
  description: string;
  follow: boolean;
  explore: boolean;
};
export type Post = {
  id: number;
  author: Person;
  body: string;
  visibility: string;
  circle_id: number | null;
  media_url?: string | null;
  media_type?: string;
  media?: Media[];
  cover_url?: string | null;
};
export type Encounter = {
  id: number | null;
  candidate?: Person;
  reason?: string;
  evidence?: { post_id: number; excerpt: string }[];
  path?: string[];
  status?: string;
  match_status?: "undecided" | "incoming" | "pending" | "matched" | "passed";
  message?: string;
  assessment?: {
    recommend: boolean;
    reason: string;
    citations: { turn: number; speaker_id: number; quote: string }[];
  } | null;
};
export type Detail = Encounter & {
  turns: { speaker_id: number; body: string }[];
};
// iOS Simulator uses localhost. On a physical phone set EXPO_PUBLIC_API_URL to your computer's LAN address.
const BASE = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";
export async function api<T>(
  path: string,
  options: RequestInit = {},
  userId = 1,
): Promise<T> {
  const response = await fetch(BASE + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": String(userId),
      ...options.headers,
    },
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = String(body.detail || message);
    } catch {}
    throw new Error(message);
  }
  return response.json();
}
export const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

export type Media = {
  id: string;
  url: string;
  kind: "image" | "video";
  size: number;
  mime_type: string;
};
export const mediaSource = (uri: string) =>
  uri.startsWith("/media/")
    ? { uri: BASE + uri, headers: { "X-User-Id": "1" } }
    : { uri };
export const mediaUploadURL = BASE + "/media";


export type PreferenceRule = {
  field: "age" | "height_cm" | "city" | "intent" | "school" | "job" | "ethnicity" | "languages" | "interests" | "lifestyle";
  op: "eq" | "in" | "contains_any" | "contains_all" | "gte" | "lte";
  value: unknown;
  strength: "hard" | "strong" | "soft";
  label?: string;
};
export type DiscoveryPolicy = {
  friendship: { enabled: boolean; rules: PreferenceRule[] };
  dating: { enabled: boolean; rules: PreferenceRule[] };
  people_per_week: number;
  max_turns_per_person: number;
  max_tokens_per_person: number;
  show_near_matches: boolean;
};

export type AuthProviders = {
  google: { enabled: boolean; label: string };
  chatgpt: { enabled: boolean; label: string; limited_trial: boolean };
  email: { enabled: boolean; label: string };
};

export type OnboardingDraft = {
  display_name: string;
  age: number | null;
  height_cm?: number | null;
  ethnicity?: string;
  city: string;
  school: string;
  education_level: string;
  field_of_study: string;
  job: string;
  company: string;
  bio: string;
  interests: string[];
  languages: string[];
  lifestyle: string[];
  intents: ("friendship" | "dating" | "networking" | "activities")[];
  looking_for: string;
  photo_ids: string[];
};
