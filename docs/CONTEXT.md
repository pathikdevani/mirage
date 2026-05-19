# Mirage

Mirage is a web-UI-driven fake data generation tool. Users define data shapes and then produce realistic synthetic records for testing, prototyping, or seeding databases.

## Language

**Workspace**:
A top-level container that holds all of a user's Schemas, Sets, and Custom Functions for one application or project. A user can have many Workspaces.

**Schema**:
A definition of a single record's shape — its properties, their types, and the rule for generating each property's fake value. A Schema property's type is one of: **Primitive** (String, Number, Boolean, Date), **Object** (inline nested structure with its own properties), **Array** (inline collection of any type, recursive), or **Reference** (pointer to a row of another Schema). Object and Array nest recursively to any depth. Every Primitive field's value comes from exactly one of two **Value Generators**: a **faker.js method** (any method exposed by faker.js) or a **Custom Function** (user-written JavaScript).
_Avoid_: Model, type, entity, record-type

**Value Generator**:
The mechanism that produces the value for a Primitive field on each row. Exactly two kinds exist: a **faker.js method** (any method from the faker.js library) or a **Custom Function** (user-written JavaScript). All other shapes — enums, literals, templates, computed values — are expressed via one of these two (e.g., enums via `faker.helpers.arrayElement`, computed values via Custom Function).
_Avoid_: Generator (collides with the historical name for Set), Producer, Factory

**Custom Function**:
A named, user-written JavaScript function stored at the Workspace level. Even when authored from a field's or Strategy's editor, the function is always saved as a Workspace-level entity (no per-field private functions exist). A Custom Function may be used as a Value Generator on any Primitive field and/or as a Strategy on any Reference, provided its signature fits the call site.
_Avoid_: Inline function, snippet, helper

**Inline**:
A nested Object or Array property whose structure is defined *within* a Schema rather than in a separate Schema. Inline structures have no identity of their own; they are part of the owning row and travel with it on export.
_Avoid_: Embedded, nested type, sub-schema

**Set**:
A named, saved recipe inside a Workspace that combines one or more Schemas with rules (how many records of each, how cross-references resolve, salt) and is *run* on demand to produce fake data. The Set is the recipe; the rows are what a run of the Set produces.
_Avoid_: Generator, batch, job, run

**Run**:
The act of executing a Set to produce rows. Rows are not persisted as a first-class entity — given the same Set definition and salt, a Run is deterministic and reproducible.
_Avoid_: Job, generation, execution, output

**Reference**:
A field on a Schema whose value points to a record of another Schema. References are always stored as pointers (never as embedded copies of the target record), even when exporting to document databases. A Reference is declared on a Schema (target Schema, cardinality `one | many{min,max}`, optionality). A Set may override **only** cardinality, min/max, and optionality — never the target Schema, field name, or the existence of the field. Overrides apply to that Set's Run only and never mutate the Schema. A Set always supplies the **Strategy** for how target rows are picked.
_Avoid_: Foreign key, FK, relation, link, embedded reference, cross-reference

**Strategy**:
The Set-level rule that decides which specific target row(s) each source row's Reference points to during a Run. Always lives on the Set, never on the Schema. Four strategies exist:

- **`1:1`** — strict bijection: each source row maps to a unique target row and vice versa. Requires source count == target count *and* cardinality `one`; errors otherwise.
- **`random`** — each source row picks targets at random, seeded by the Set's salt. When cardinality is `many`, the user chooses `allowDuplicates: true | false` — controls whether the same target id may appear more than once within a single source row's array. (Across source rows, the same target can always appear in many — that's a property of randomness, not a duplicate.)
- **`evenSplit`** — references are distributed as evenly as possible across target rows. With cardinality `one`, each target id is referenced by ~`source_count / target_count` source rows. With cardinality `many`, target-side counts are balanced and per-source cardinality is treated as a flexible range within `[min, max]`.
- **`custom`** — user-written JavaScript function in the in-UI editor. Signature: `({ sourceRows, targetRows, cardinality, rng, salt }) => string[] | string[][]` — returns one target id per source row for cardinality `one`, or an array of target ids per source row for cardinality `many`. `rng()` is a deterministic PRNG seeded from the Set's salt.

_Avoid_: Mapping, resolver, picker, rule

## Relationships

- A **Workspace** contains zero or more **Schemas**, **Sets**, and **Custom Functions**.
- A **Set** references one or more **Schemas** from its **Workspace**.
- A **Schema** may declare **Reference** fields that point to other **Schemas** within the same **Workspace**.
- A **Schema**'s Primitive field uses a **Value Generator** which is either a faker.js method or a **Custom Function** from the same Workspace.
- A **Set**'s **Strategy** for a Reference may be `1:1`, `random`, `evenSplit`, or a **Custom Function** from the same Workspace.

## Flagged ambiguities

- "Generator" was used in PRODUCT.md as a heading but the body called it a "set" — resolved: the concept is named **Set**, and "Generator" is not used.
- Whether **Set** means the recipe or the produced rows — resolved: **Set** is the recipe only. Running a Set produces rows; rows are ephemeral (re-derivable from `Set + salt`).
