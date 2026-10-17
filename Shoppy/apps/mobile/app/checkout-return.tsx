import { Redirect, useLocalSearchParams } from "expo-router";

export default function CheckoutReturn() {
  const { state } = useLocalSearchParams<{ state?: string }>();
  return <Redirect href={{ pathname: "/checkout", params: { verify: typeof state === "string" ? state : "return" } }} />;
}
