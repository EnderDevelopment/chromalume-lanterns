import { world, system, MolangVariableMap, DynamicPropertiesDefinition } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";

const BLOCK_ID = "adjustable_lantern:adjustable_lantern";
const SETTINGS_PROPERTY = "adjustable_lantern.settings";
const defaults = { red: 255, green: 180, blue: 70, brightness: 8 };
const keyFor = (dimension, location) => `${dimension.id}|${location.x},${location.y},${location.z}`;

world.afterEvents.worldInitialize.subscribe(({ propertyRegistry }) => {
  const definition = new DynamicPropertiesDefinition();
  definition.defineString(SETTINGS_PROPERTY, 32767);
  propertyRegistry.registerWorldDynamicProperties(definition);
});

function allSettings() {
  const raw = world.getDynamicProperty(SETTINGS_PROPERTY);
  if (typeof raw !== "string") return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function readSettings(dimension, location) {
  const value = allSettings()[keyFor(dimension, location)];
  if (!value) return { ...defaults };
  return {
    red: Math.max(0, Math.min(255, Number(value.red) || 0)),
    green: Math.max(0, Math.min(255, Number(value.green) || 0)),
    blue: Math.max(0, Math.min(255, Number(value.blue) || 0)),
    brightness: Math.max(0, Math.min(15, Number(value.brightness) || 0))
  };
}

function saveSettings(dimension, location, settings) {
  const values = allSettings();
  values[keyFor(dimension, location)] = settings;
  world.setDynamicProperty(SETTINGS_PROPERTY, JSON.stringify(values));
}

function showLanternForm(player, dimension, location) {
  const current = readSettings(dimension, location);
  const form = new ModalFormData()
    .title("Adjustable Lantern")
    .slider("Red", 0, 255, { valueStep: 1, defaultValue: current.red })
    .slider("Green", 0, 255, { valueStep: 1, defaultValue: current.green })
    .slider("Blue", 0, 255, { valueStep: 1, defaultValue: current.blue })
    .slider("Brightness (visual aura)", 0, 15, { valueStep: 1, defaultValue: current.brightness });
  form.show(player).then((response) => {
    if (response.canceled || !response.formValues) return;
    const [red, green, blue, brightness] = response.formValues.map(Number);
    saveSettings(dimension, location, { red, green, blue, brightness });
    const hex = [red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase();
    player.sendMessage(`Lantern color set to #${hex}, brightness ${brightness}/15.`);
  }).catch(() => {});
}

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  if (event.block.typeId !== BLOCK_ID) return;
  event.cancel = true;
  const dimension = event.block.dimension;
  const location = { ...event.block.location };
  system.run(() => showLanternForm(event.player, dimension, location));
});

function emitAura(dimension, location, settings) {
  if (settings.brightness === 0) return;
  const variables = new MolangVariableMap();
  variables.setColorRGB("variable.color", {
    red: settings.red / 255,
    green: settings.green / 255,
    blue: settings.blue / 255
  });
  variables.setFloat("variable.scale", 0.2 + settings.brightness / 30);
  dimension.spawnParticle("minecraft:colored_flame_particle", {
    x: location.x + 0.5,
    y: location.y + 0.65,
    z: location.z + 0.5
  }, variables);
}

system.runInterval(() => {
  for (const dimensionId of ["overworld", "nether", "the_end"]) {
    const dimension = world.getDimension(dimensionId);
    for (const player of dimension.getPlayers()) {
      const center = player.location;
      for (let x = Math.floor(center.x) - 8; x <= Math.floor(center.x) + 8; x += 1) {
        for (let y = Math.floor(center.y) - 6; y <= Math.floor(center.y) + 6; y += 1) {
          for (let z = Math.floor(center.z) - 8; z <= Math.floor(center.z) + 8; z += 1) {
            const block = dimension.getBlock({ x, y, z });
            if (block?.typeId === BLOCK_ID) emitAura(dimension, block.location, readSettings(dimension, block.location));
          }
        }
      }
    }
  }
}, 10);
