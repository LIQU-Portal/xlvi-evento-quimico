import assert from "node:assert/strict";
import { parseSpeakerProfiles } from "../lib/speaker-profiles.ts";

const profiles = parseSpeakerProfiles([
  ["Ponentes"], [], [],
  ["idActividad", "orden", "nombre", "semblanza", "fotoFileId", "visible"],
  ["32", "2", "Segundo ponente", "Semblanza del segundo ponente", "", "Sí"],
  ["32", "1", "Q. Mayra Vazquez", "Semblanza de Mayra", "https://drive.google.com/file/d/1234567890abcDEF/view", "Sí"],
  ["32", "3", "Ficha sin aprobar", "No debe mostrarse", "", "No"],
  ["33", "1", "Ficha incompleta", "", "", "Sí"],
]);

assert.deepEqual(profiles.map(({ activityId, order, name }) => [activityId, order, name]), [
  [32, 1, "Q. Mayra Vazquez"],
  [32, 2, "Segundo ponente"],
]);
assert.equal(profiles[0].photoFileId, "1234567890abcDEF");
assert.equal(profiles[1].photoFileId, undefined);
console.log("Ponentes: relación por actividad, orden, visibilidad y foto opcional verificados.");
