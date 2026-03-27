"use strict";

import type { RuploadMediaType, WaveformData } from "./types";

export const DEFAULT_UA =
  "Dalvik/2.1.0 (Linux; U; Android 9; 23113RKC6C Build/PQ3A.190605.06171036) [FBAN/Orca-Android;FBAV/524.0.0.44.109;FBPN/com.facebook.orca;FBLC/vi_VN;FBBV/788947415;FBCR/MobiFone;FBMF/Redmi;FBBD/Redmi;FBDV/23113RKC6C;FBSV/9;FBCA/x86:armeabi-v7a;FBDM/{density=3.0,width=1080,height=1920};FB_FW/1;]";

export const MEDIA_ENDPOINT: Record<RuploadMediaType, string> = {
  image: "messenger_image",
  video: "messenger_video",
  audio: "messenger_audio",
  gif: "messenger_gif",
};

export const FRIENDLY_NAME: Record<RuploadMediaType, string> = {
  image: "msysDataTask4",
  video: "msysDataTask3",
  audio: "msysDataTask4",
  gif: "msysDataTask4",
};

export const MESSAGE_SOURCE: Record<RuploadMediaType, string> = {
  image: "65554",
  video: "65540",
  audio: "65537",
  gif: "65554",
};

export const AUDIO_WAVEFORM_FALLBACK: WaveformData = {
  amplitudes: [0.0, 0.066, 0.091, 0.059, 0.094, 0.11, 0.077, 0.072, 0.064],
  sampling_freq: 2,
};

export const ANALYTICS_HEADER = JSON.stringify({
  network_tags: { product: "256002347743983", retry_attempt: "0" },
  application_tags: "unknown",
});

export const ZERO_EH =
  "2,,AUYKnE5rPfughZhCzzFyALO2sT6e3DkSHGBCJFd0CF5qVrYHvK0Alu9-dVN6GH4RyeQ";
