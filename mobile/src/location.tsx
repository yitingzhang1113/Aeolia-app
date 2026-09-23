import React, { useState } from "react";
import { Platform, Text, View } from "react-native";
import * as Location from "expo-location";
import { api, json, Person } from "./api";
import { Button, Field, Pill, styles } from "./ui";

export function LocationSettings({
  me,
  saved,
}: {
  me: Person | null;
  saved: () => Promise<unknown>;
}) {
  const [city, setCity] = useState(me?.city || "");
  const [radius, setRadius] = useState(me?.location?.radius_km || 25);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const save = async (current: boolean) => {
    setBusy(true);
    setMessage("");
    try {
      if (current || Platform.OS === "android") {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted)
          throw new Error(
            "Location access wasn't granted. Enable it in your device settings to use your current location.",
          );
      }
      let latitude: number,
        longitude: number,
        label = city.trim();
      if (current) {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        ({ latitude, longitude } = position.coords);
        const addresses = await Location.reverseGeocodeAsync({
          latitude,
          longitude,
        });
        label = addresses[0]?.city || addresses[0]?.region || "Current area";
      } else if (me?.location && label === me.city) {
        ({ latitude, longitude } = me.location);
      } else {
        if (!label) throw new Error("Enter a city first.");
        const points = await Location.geocodeAsync(label);
        if (!points.length)
          throw new Error(
            "City not found. Include the state or country and try again.",
          );
        if (points.length > 1)
          throw new Error(
            "Several places match. Add the state or country to be more specific.",
          );
        ({ latitude, longitude } = points[0]);
      }
      await api(
        "/me/location",
        json("PUT", { city: label, latitude, longitude, radius_km: radius }),
      );
      setCity(label);
      await saved();
      setMessage(`Saved · within ${radius} km of ${label}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 14 }}>
      <Text style={styles.muted}>
        Find people near your current location or a city you choose. Other
        people see your city, not your coordinates.
      </Text>
      <Field
        value={city}
        onChangeText={setCity}
        placeholder="City, state or country"
        editable={!busy}
      />
      <Text style={styles.text}>Search distance</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {[10, 25, 50, 100].map((value) => (
          <Pill
            key={value}
            label={`${value} km`}
            active={radius === value}
            onPress={busy ? undefined : () => setRadius(value)}
          />
        ))}
      </View>
      <Button
        label="Save location & distance"
        disabled={busy || !city.trim()}
        onPress={() => save(false)}
      />
      <Button
        label="Use my current location"
        icon="locate-outline"
        secondary
        loading={busy}
        onPress={() => save(true)}
      />
      {me?.location && (
        <Button
          label="Remove saved location"
          secondary
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await api("/me/location", { method: "DELETE" });
              await saved();
              setMessage("Location removed. Near me is off.");
            } catch (error) {
              setMessage(String(error));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {!!message && (
        <Text accessibilityRole="alert" style={styles.muted}>
          {message}
        </Text>
      )}
    </View>
  );
}
