import React from "react";
import { Text, View } from "react-native";
import { Button, Section, styles } from "./ui";
import { colors as c } from "./theme";

export function WelcomeAuth({
  googleEnabled,
  chatgptEnabled,
  onGoogle,
  onChatGPT,
  onEmail,
}: {
  googleEnabled: boolean;
  chatgptEnabled: boolean;
  onGoogle: () => void;
  onChatGPT: () => void;
  onEmail: () => void;
}) {
  return (
    <View style={[styles.body, { flex: 1, justifyContent: "center", gap: 22 }]}>
      <View style={{ gap: 8 }}>
        <Text style={styles.heading}>Meet people worth knowing.</Text>
        <Text style={styles.muted}>
          Aeolia filters first, lets your Elf explore a few promising people, and leaves Connect to you.
        </Text>
      </View>
      <Section title="Create your Aeolia account">
        <View style={{ gap: 12 }}>
          <Button label="Continue with Google" onPress={onGoogle} secondary />
          <Button
            label={chatgptEnabled ? "Continue with ChatGPT" : "Connect ChatGPT · coming soon"}
            onPress={onChatGPT}
            secondary
          />
          <Button label="Continue with email" onPress={onEmail} secondary />
        </View>
        {!googleEnabled && (
          <Text style={[styles.muted, { marginTop: 12 }]}>
            Google sign-in appears here as soon as the development OAuth client is configured.
          </Text>
        )}
        {!chatgptEnabled && (
          <Text style={[styles.muted, { marginTop: 8 }]}>
            ChatGPT identity sign-in requires Aeolia's issued OpenAI client ID. You can still connect Aeolia to ChatGPT through the personal-AI integration separately.
          </Text>
        )}
      </Section>
      <Text style={[styles.muted, { color: c.ink }]}>
        Your real photos stay out of Elf conversations. Your private discovery rules stay private. Only you can Connect.
      </Text>
    </View>
  );
}
