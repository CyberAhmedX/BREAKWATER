import type { Chapter } from "../engine/types";

// Each chapter has a mood: it decides the sky, the amount of rain, whether
// lightning strikes, and how dark the room sits. Cozy at the start, blackout
// at the end.
export interface Mood {
  name: string;
  sky: [string, string]; // gradient top, bottom
  room: string; // base wall color
  floor: string;
  ambient: number; // 0 bright .. 1 dark overlay strength
  rain: number; // 0 none .. 1 downpour
  lightning: boolean;
  emergency: boolean; // red emergency lighting (finale)
  lampWarm: number; // 0..1 how much the desk lamps glow
}

export const MOODS: Record<Chapter, Mood> = {
  0: {
    name: "Lobby, morning",
    sky: ["#bfe3f5", "#e9f6ff"],
    room: "#f0e4d0",
    floor: "#caa47a",
    ambient: 0.0,
    rain: 0,
    lightning: false,
    emergency: false,
    lampWarm: 0.15,
  },
  1: {
    name: "Fair Weather",
    sky: ["#a9d8ef", "#f2ead6"],
    room: "#e7d9c2",
    floor: "#bd9870",
    ambient: 0.05,
    rain: 0,
    lightning: false,
    emergency: false,
    lampWarm: 0.2,
  },
  2: {
    name: "Overcast",
    sky: ["#9aa7b4", "#c6ccd2"],
    room: "#cdc3b4",
    floor: "#9e8468",
    ambient: 0.22,
    rain: 0.15,
    lightning: false,
    emergency: false,
    lampWarm: 0.45,
  },
  3: {
    name: "Squall",
    sky: ["#5a6774", "#828c93"],
    room: "#a79e92",
    floor: "#7c6650",
    ambient: 0.42,
    rain: 0.5,
    lightning: false,
    emergency: false,
    lampWarm: 0.7,
  },
  4: {
    name: "Gale",
    sky: ["#2b3340", "#444d5a"],
    room: "#6f6a62",
    floor: "#53443a",
    ambient: 0.6,
    rain: 0.85,
    lightning: true,
    emergency: false,
    lampWarm: 0.9,
  },
  5: {
    name: "Storm Surge",
    sky: ["#11151d", "#1d242f"],
    room: "#3a3a40",
    floor: "#2c2730",
    ambient: 0.64,
    rain: 1,
    lightning: true,
    emergency: true,
    lampWarm: 1,
  },
  6: {
    name: "After",
    sky: ["#223047", "#3c5172"],
    room: "#4a4a52",
    floor: "#343039",
    ambient: 0.5,
    rain: 0.2,
    lightning: false,
    emergency: false,
    lampWarm: 0.8,
  },
};
