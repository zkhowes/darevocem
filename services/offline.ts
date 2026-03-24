import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from './supabase';
import { OFFLINE } from '../constants/config';
import type { UsageEvent, SessionTrace } from '../types';

const QUEUE_KEY = 'darevocem-offline-queue';
const CACHE_PREFIX = 'darevocem-cache-';

type QueueItem =
  | { type: 'usage_event'; data: Omit<UsageEvent, 'id' | 'created_at'> }
  | { type: 'session_trace'; data: Record<string, unknown> };

export async function cacheData<T>(key: string, data: T): Promise<void> {
  await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data));
}

export async function getCachedData<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
  return raw ? JSON.parse(raw) : null;
}

export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return state.isConnected === true;
}

async function getQueue(): Promise<QueueItem[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function setQueue(queue: QueueItem[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function queueEvent(item: QueueItem): Promise<void> {
  const queue = await getQueue();
  if (queue.length >= OFFLINE.maxQueueSize) {
    // Prefer dropping usage_events over session_traces (less critical)
    const eventIndex = queue.findIndex((q) => q.type === 'usage_event');
    if (eventIndex >= 0) {
      queue.splice(eventIndex, 1);
    } else {
      queue.shift();
    }
  }
  queue.push(item);
  await setQueue(queue);
}

export async function drainQueue(): Promise<void> {
  const online = await isOnline();
  if (!online) return;

  const queue = await getQueue();
  if (queue.length === 0) return;

  const failed: QueueItem[] = [];

  for (const item of queue) {
    try {
      if (item.type === 'usage_event') {
        const { error } = await supabase.from('usage_events').insert(item.data);
        if (error) { failed.push(item); }
      } else if (item.type === 'session_trace') {
        const { error } = await supabase.from('session_traces').insert(item.data);
        if (error) { failed.push(item); }
      }
    } catch {
      failed.push(item);
    }
  }

  await setQueue(failed);
}

let unsubscribe: (() => void) | null = null;

export function startSyncListener(): void {
  if (unsubscribe) return;
  unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      drainQueue();
    }
  });
}

export function stopSyncListener(): void {
  unsubscribe?.();
  unsubscribe = null;
}
