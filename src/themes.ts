export interface PuzzleTheme {
  readonly id: string;
  readonly title: string;
  readonly words: readonly string[];
  readonly colors: readonly string[];
}

export const THEMES: readonly PuzzleTheme[] = Object.freeze([
  {
    id: "nature",
    title: "Nature",
    colors: ["#168aad", "#52b788", "#e9c46a", "#f4a261", "#9b5de5", "#ef476f"],
    words: ["sun", "sky", "bee", "oak", "fog", "sea", "ant", "ice", "bug", "mud", "rain", "tree", "wind", "leaf", "rock", "pine", "lily", "pond", "bird", "moss", "cloud", "plant", "earth", "creek", "grass", "tulip", "beach", "flora", "fungi", "delta", "forest", "canyon", "valley", "desert", "sunset", "meadow", "rapids", "garden", "stream", "flower"],
  },
  {
    id: "ocean",
    title: "Ocean",
    colors: ["#0077b6", "#00b4d8", "#48cae4", "#ff9f1c", "#2ec4b6", "#5e60ce"],
    words: ["wave", "tide", "reef", "shell", "coral", "whale", "shark", "dolphin", "squid", "crab", "pearl", "kelp", "coast", "island", "lagoon", "current", "harbor", "anchor", "sail", "oyster", "seal", "ray", "foam", "depth", "blue", "drift", "storm", "beacon", "marina", "seabird"],
  },
  {
    id: "cosmos",
    title: "Cosmos",
    colors: ["#4361ee", "#7209b7", "#f72585", "#4cc9f0", "#ffbe0b", "#8338ec"],
    words: ["star", "moon", "orbit", "comet", "nova", "planet", "meteor", "galaxy", "nebula", "rocket", "solar", "lunar", "space", "eclipse", "cosmos", "saturn", "venus", "mars", "earth", "pluto", "quasar", "pulsar", "crater", "module", "gravity", "vacuum", "astral", "zenith", "horizon", "cluster"],
  },
  {
    id: "kitchen",
    title: "Kitchen",
    colors: ["#e76f51", "#2a9d8f", "#e9c46a", "#6d597a", "#f28482", "#84a59d"],
    words: ["spoon", "fork", "plate", "bowl", "knife", "glass", "oven", "stove", "pan", "pot", "whisk", "grater", "kettle", "mixer", "apron", "recipe", "timer", "spice", "flour", "sugar", "bread", "toast", "sauce", "herb", "steam", "slice", "blend", "bake", "roast", "simmer"],
  },
]);

export function getTheme(themeId: string): PuzzleTheme {
  return THEMES.find((theme) => theme.id === themeId) ?? THEMES[0]!;
}
