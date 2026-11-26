import { Platform } from 'react-native';

import type { CattlePassage } from '@/types/cattle';

/**
 * Base URL for the HerdSight FastAPI backend.
 *
 * For Expo Web or iOS Simulator on the same machine, `http://localhost:8000` works.
 * For testing on a physical phone over local Wi-Fi, replace `localhost` with your
 * laptop's LAN IPv4 address (e.g. `http://192.168.1.42:8000`).
 */
export const API_BASE_URL = 'http://192.168.0.101:8000';

const REQUEST_TIMEOUT_MS = 60000;

/**
 * Upload a recorded or imported walk-through video to `POST /analyze-video`
 * and return the scored `CattlePassage` records produced by the backend.
 */
export async function uploadVideoForAnalysis(
  videoUri: string,
  nextEntryOrder: number,
): Promise<CattlePassage[]> {
  const formData = new FormData();

  if (Platform.OS === 'web') {
    const fileResponse = await fetch(videoUri);
    const blob = await fileResponse.blob();
    formData.append('file', blob, 'cow_passage.mp4');
  } else {
    const normalizedUri =
      videoUri.startsWith('file://') || videoUri.startsWith('content://')
        ? videoUri
        : `file://${videoUri}`;
    formData.append('file', {
      uri: normalizedUri,
      name: 'cow_passage.mp4',
      type: 'video/mp4',
    } as unknown as Blob);
  }

  formData.append('next_entry_order', String(nextEntryOrder));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}/analyze-video`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const raw = await response.text().catch(() => '');
      let detail = raw;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { detail?: string };
          if (typeof parsed.detail === 'string' && parsed.detail.length > 0) {
            detail = parsed.detail;
          }
        } catch {
          // Keep raw response text when body is not JSON.
        }
      }
      throw new Error(
        `Backend error (${response.status}): ${detail || response.statusText}`,
      );
    }

    const passages = (await response.json()) as CattlePassage[];
    return passages;
  } finally {
    clearTimeout(timeoutId);
  }
}
