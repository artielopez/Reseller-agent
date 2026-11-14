"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";
import { getSupabase } from "./supabase";

export const RequestOwner = createContext<string | null>(null);

/** Account-keyed UI requests stop on owner change, before an Auth lock can
 * dispatch them using a later session. Dispatched writes still need reconciliation.
 * Setup creates a fresh scope for Strict Mode replay; no credentials are retained. */
export function useRequestLifetime() {
  const owner = useContext(RequestOwner);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    const subscription = owner
      ? getSupabase().auth.onAuthStateChange((_event, session) => {
          // Synchronous callback: do not wait on Auth from inside its lock.
          if (session?.user.id !== owner) controller.abort();
        }).data.subscription
      : undefined;
    return () => {
      controller.abort();
      subscription?.unsubscribe();
    };
  }, [owner]);
  return useCallback(() => lifetime.current?.signal ?? AbortSignal.abort(), []);
}
