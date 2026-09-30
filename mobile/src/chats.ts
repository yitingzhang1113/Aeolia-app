import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Local-only chat-list state for the prototype. Pinning, hiding, manual order
// and groups live on the device; the backend has no group-chat or list model yet.
export type ChatGroup = {
  id: string;
  name: string;
  memberIds: number[];
  createdAt: number;
};
export type GroupMessage = {
  id: string;
  senderId: number;
  body: string;
  at: number;
};
export type ChatPrefs = {
  pinned: string[]; // composite keys, e.g. "f:2" or "g:abc"
  hidden: string[]; // keys removed from the list
  order: string[]; // manual order of keys (pinned still sort first)
  groups: ChatGroup[];
  groupMessages: Record<string, GroupMessage[]>;
};

// Composite keys keep friends and groups in one pin/hide/order namespace.
export const friendKey = (id: number) => `f:${id}`;
export const groupKey = (id: string) => `g:${id}`;

const STORAGE_KEY = "aeolia.chats.v1";
const empty: ChatPrefs = {
  pinned: [],
  hidden: [],
  order: [],
  groups: [],
  groupMessages: {},
};

const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export type ChatsStore = {
  ready: boolean;
  prefs: ChatPrefs;
  isPinned: (key: string) => boolean;
  isHidden: (key: string) => boolean;
  togglePin: (key: string) => void;
  remove: (key: string) => void;
  restoreAll: () => void;
  swap: (a: string, b: string) => void;
  createGroup: (name: string, memberIds: number[]) => ChatGroup;
  deleteGroup: (id: string) => void;
  sendGroupMessage: (groupId: string, senderId: number, body: string) => void;
  // Order a list of keys for display: pinned first, then manual order, then the rest.
  sortKeys: (keys: string[]) => string[];
};

export function useChats(): ChatsStore {
  const [prefs, setPrefs] = useState<ChatPrefs>(empty);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setPrefs({ ...empty, ...JSON.parse(raw) });
      } catch {
        // Corrupt or missing state falls back to empty; nothing to recover.
      } finally {
        loaded.current = true;
        setReady(true);
      }
    })();
  }, []);

  // Persist after the first load so we never overwrite stored state with the
  // initial empty value before it is read.
  useEffect(() => {
    if (!loaded.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)).catch(() => {});
  }, [prefs]);

  const togglePin = useCallback((key: string) => {
    setPrefs((p) => ({
      ...p,
      pinned: p.pinned.includes(key)
        ? p.pinned.filter((k) => k !== key)
        : [...p.pinned, key],
    }));
  }, []);

  const remove = useCallback((key: string) => {
    setPrefs((p) => ({
      ...p,
      hidden: p.hidden.includes(key) ? p.hidden : [...p.hidden, key],
      pinned: p.pinned.filter((k) => k !== key),
    }));
  }, []);

  const restoreAll = useCallback(() => {
    setPrefs((p) => ({ ...p, hidden: [] }));
  }, []);

  const swap = useCallback((a: string, b: string) => {
    setPrefs((p) => {
      const order = [...p.order];
      for (const k of [a, b]) if (!order.includes(k)) order.push(k);
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      [order[ia], order[ib]] = [order[ib], order[ia]];
      return { ...p, order };
    });
  }, []);

  const createGroup = useCallback((name: string, memberIds: number[]) => {
    const group: ChatGroup = {
      id: uid(),
      name: name.trim(),
      memberIds,
      createdAt: Date.now(),
    };
    setPrefs((p) => ({ ...p, groups: [...p.groups, group] }));
    return group;
  }, []);

  const deleteGroup = useCallback((id: string) => {
    const key = groupKey(id);
    setPrefs((p) => {
      const groupMessages = { ...p.groupMessages };
      delete groupMessages[id];
      return {
        ...p,
        groups: p.groups.filter((g) => g.id !== id),
        pinned: p.pinned.filter((k) => k !== key),
        hidden: p.hidden.filter((k) => k !== key),
        order: p.order.filter((k) => k !== key),
        groupMessages,
      };
    });
  }, []);

  const sendGroupMessage = useCallback(
    (groupId: string, senderId: number, body: string) => {
      const message: GroupMessage = {
        id: uid(),
        senderId,
        body: body.trim(),
        at: Date.now(),
      };
      setPrefs((p) => ({
        ...p,
        groupMessages: {
          ...p.groupMessages,
          [groupId]: [...(p.groupMessages[groupId] || []), message],
        },
      }));
    },
    [],
  );

  const sortKeys = useCallback(
    (keys: string[]) => {
      const pinRank = (k: string) => (prefs.pinned.includes(k) ? 0 : 1);
      const orderRank = (k: string) => {
        const i = prefs.order.indexOf(k);
        return i === -1 ? Number.MAX_SAFE_INTEGER : i;
      };
      // Stable sort: pinned first, then manual order; unordered keep input order.
      return keys
        .map((k, i) => ({ k, i }))
        .sort((a, b) => {
          const pr = pinRank(a.k) - pinRank(b.k);
          if (pr) return pr;
          const or = orderRank(a.k) - orderRank(b.k);
          if (or) return or;
          return a.i - b.i;
        })
        .map((x) => x.k);
    },
    [prefs.pinned, prefs.order],
  );

  return {
    ready,
    prefs,
    isPinned: (key) => prefs.pinned.includes(key),
    isHidden: (key) => prefs.hidden.includes(key),
    togglePin,
    remove,
    restoreAll,
    swap,
    createGroup,
    deleteGroup,
    sendGroupMessage,
    sortKeys,
  };
}
