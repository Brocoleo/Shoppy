import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";

let wired = false;

/**
 * Conecta React Query con el estado real de red (Fase D).
 * Sin esto, las queries reintentan contra el vacío con wifi apagado;
 * con esto, quedan en `fetchStatus: "paused"` y se reanudan al reconectar.
 * Llamar una vez (root layout). Requiere dev build (módulo nativo, no Expo Go).
 */
export function setupOnlineManager() {
  if (wired) return;
  wired = true;
  onlineManager.setEventListener((setOnline) => {
    return NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
  });
}

export function useIsOnline() {
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
  }, []);
  return isOnline;
}
