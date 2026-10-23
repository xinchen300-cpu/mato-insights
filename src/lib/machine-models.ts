// The MATO models a machine can be (24-10-2026, Xin: "add my automaat and say what kind of automaat they have and also
// they can click on it to see key features", with the folder of the MATO B1). machines.model holds the key; the words
// are in messages (machineModels.<key>), the pictures under public/models/<key>/, taken from the folder. Pure, without
// imports: the profile, the machine settings and the action share it.

export const MACHINE_MODELS = ["mato-b1"] as const;
export type MachineModel = (typeof MACHINE_MODELS)[number];

/** A key read from the database or a form, if it is one of ours; anything else is "not set". */
export function asMachineModel(value: unknown): MachineModel | null {
  return (MACHINE_MODELS as readonly unknown[]).includes(value) ? (value as MachineModel) : null;
}

/** Its key features, in the folder's order: each with its photo and its words in machineModels.<model>.features. */
export const MODEL_FEATURES = ["lift", "led", "cooling", "layout"] as const;
export type ModelFeature = (typeof MODEL_FEATURES)[number];

export type ModelSheet = {
  name: string;
  /** The kind of machine it is, as machines.type. */
  type: "lift" | "spiral";
  /** The machine alone, on a transparent ground. */
  image: string;
  features: Record<ModelFeature, string>;
  capacityImage: string;
  rows: number;
  slotsPerRow: number;
  heightCm: number;
  widthCm: number;
  depthCm: number;
  weightKg: number;
  tempMin: number;
  tempMax: number;
  breadBags: number;
  mealTrays: number;
};

export const MODEL_SHEETS: Record<MachineModel, ModelSheet> = {
  "mato-b1": {
    name: "MATO B1",
    type: "lift",
    image: "/models/mato-b1/b1.webp",
    features: {
      lift: "/models/mato-b1/b1-lift.webp",
      led: "/models/mato-b1/b1-led.webp",
      cooling: "/models/mato-b1/b1-cooling.webp",
      layout: "/models/mato-b1/b1-layout.webp",
    },
    capacityImage: "/models/mato-b1/b1-capacity.webp",
    rows: 7,
    slotsPerRow: 7,
    heightCm: 202,
    widthCm: 135,
    depthCm: 95,
    weightKg: 320,
    tempMin: 1,
    tempMax: 20,
    breadBags: 54,
    mealTrays: 42,
  },
};
