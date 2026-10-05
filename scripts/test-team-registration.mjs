import assert from "node:assert/strict";

import { containsEmailAddress } from "../lib/team-registration.ts";

assert.equal(containsEmailAddress("Los Catalizadores"), false);
assert.equal(containsEmailAddress("Equipo Quantum 3"), false);
assert.equal(containsEmailAddress("alumno@alumnos.udg.mx"), true);
assert.equal(
  containsEmailAddress("Equipo de alumno@alumnos.udg.mx"),
  true,
);
assert.equal(containsEmailAddress("Química @ CUCEI"), false);

console.log("Team-name checks passed: names accepted and email addresses rejected.");
