// Regenerate src/registry.generated.ts by introspecting @faker-js/faker.
// Emits FAKER_GROUPS (prototype walk) AND FAKER_REGISTRY (param signatures
// derived from the package's TypeScript declarations).
//
// Run with: pnpm --filter @mirage/fakerjs run generate

import { faker } from '@faker-js/faker';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const SKIP_NAMESPACES = new Set(['rawDefinitions', 'definitions']);

// ---------- 1. Prototype walk → FAKER_GROUPS ----------

function collectMethods(moduleInstance) {
  const names = new Set();
  let proto = Object.getPrototypeOf(moduleInstance);
  while (proto && proto !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor' || name.startsWith('_')) continue;
      const desc = Object.getOwnPropertyDescriptor(proto, name);
      if (!desc) continue;
      if (typeof desc.value === 'function') names.add(name);
    }
    proto = Object.getPrototypeOf(proto);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

const groups = [];
for (const ns of Object.keys(faker).sort((a, b) => a.localeCompare(b))) {
  if (SKIP_NAMESPACES.has(ns) || ns.startsWith('_')) continue;
  const mod = faker[ns];
  if (!mod || typeof mod !== 'object') continue;
  const methods = collectMethods(mod).filter((m) => typeof mod[m] === 'function');
  if (methods.length === 0) continue;
  groups.push({ ns, methods });
}

// ---------- 2. TypeScript signature scan → FAKER_REGISTRY ----------

// Faker bundles all module declarations into a chunked .d.ts (e.g.
// `airline-XXXXX.d.ts`). Locate it by reading the package's main d.ts and
// resolving the first relative import.
const fakerPkgDir = dirname(require.resolve('@faker-js/faker/package.json'));
const mainDts = join(fakerPkgDir, 'dist', 'index.d.ts');
const mainDtsText = ts.sys.readFile(mainDts) ?? '';
const chunkMatch = mainDtsText.match(/from\s+['"](\.\/[^'"]+\.js)['"]/);
const chunkPath = chunkMatch
  ? join(fakerPkgDir, 'dist', chunkMatch[1].replace(/\.js$/, '.d.ts'))
  : null;
if (!chunkPath || !ts.sys.fileExists(chunkPath)) {
  throw new Error(
    `Could not locate faker chunked declaration file (looked for ${chunkPath ?? '<none>'})`,
  );
}

const program = ts.createProgram([chunkPath], {
  allowJs: false,
  declaration: true,
  lib: ['lib.es2020.d.ts'],
});
const checker = program.getTypeChecker();
const sourceFile = program.getSourceFile(chunkPath);

// Map both lowercased namespace AND class name → ClassDeclaration so we can
// walk inheritance chains (DateModule extends SimpleDateModule, etc.).
const moduleClasses = new Map();
function visit(node) {
  if (ts.isClassDeclaration(node) && node.name) {
    const nm = node.name.text;
    if (nm.endsWith('Module')) {
      const ns = nm.slice(0, -'Module'.length).toLowerCase();
      moduleClasses.set(ns, node);
      moduleClasses.set(nm, node);
    }
  }
  ts.forEachChild(node, visit);
}
if (sourceFile) visit(sourceFile);

function classChainMethods(cls) {
  const out = new Map();
  let current = cls;
  const visited = new Set();
  while (current && !visited.has(current)) {
    visited.add(current);
    for (const member of current.members ?? []) {
      if ((ts.isMethodDeclaration(member) || ts.isMethodSignature(member)) && member.name) {
        const name = member.name.getText?.();
        if (name && !name.startsWith('_') && !out.has(name)) {
          out.set(name, member);
        }
      }
    }
    const heritage = current.heritageClauses?.find(
      (h) => h.token === ts.SyntaxKind.ExtendsKeyword,
    );
    const baseExpr = heritage?.types?.[0]?.expression;
    const baseName = baseExpr && ts.isIdentifier(baseExpr) ? baseExpr.text : null;
    current = baseName ? moduleClasses.get(baseName) : null;
  }
  return out;
}

const INTEGER_NAME_HINT =
  /^(length|count|precision|max|min|years|days|width|height|blur|fractionDigits|extensionCount|sentenceCount|wordCount|dec|size|index)$/i;

function classifyType(type) {
  if (!type) return { kind: 'string' };
  const flags = type.flags;
  if (flags & ts.TypeFlags.Number) return { kind: 'number' };
  if (flags & ts.TypeFlags.String) return { kind: 'string' };
  if (flags & ts.TypeFlags.Boolean || flags & ts.TypeFlags.BooleanLiteral)
    return { kind: 'boolean' };
  if (flags & ts.TypeFlags.Union) {
    const types = type.types ?? [];
    const meaningful = types.filter(
      (t) => !(t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)),
    );
    if (meaningful.length > 0 && meaningful.every((t) => typeof t.value === 'string')) {
      return { kind: 'enum', options: meaningful.map((t) => t.value) };
    }
    const allNumber = meaningful.every(
      (t) => t.flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral),
    );
    if (allNumber && meaningful.length > 0) return { kind: 'number' };
    const allBool = meaningful.every(
      (t) => t.flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral),
    );
    if (allBool && meaningful.length > 0) return { kind: 'boolean' };
  }
  if (typeof checker.isArrayType === 'function' && checker.isArrayType(type))
    return { kind: 'array' };
  if (type.symbol?.name === 'Array') return { kind: 'array' };
  if (type.symbol?.name === 'Date') return { kind: 'date' };
  return { kind: 'string' };
}

function inferParam(symbol, declaration) {
  const name = symbol.getName();
  const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
  const cls = classifyType(type);
  if (cls.kind === 'number' && INTEGER_NAME_HINT.test(name)) cls.kind = 'integer';
  return {
    name,
    kind: cls.kind,
    label: name,
    ...(cls.options ? { options: cls.options } : {}),
  };
}

function inferSignature(methodDecl) {
  if (!methodDecl.parameters || methodDecl.parameters.length === 0) {
    return { shape: 'none', params: [] };
  }
  if (methodDecl.parameters.length === 1) {
    const p = methodDecl.parameters[0];
    const typeNode = p.type;
    if (typeNode) {
      const looksLikeOptions =
        typeNode.kind === ts.SyntaxKind.TypeLiteral ||
        (ts.isTypeReferenceNode(typeNode) &&
          /Options$/.test(typeNode.typeName?.getText?.() ?? ''));
      if (looksLikeOptions) {
        const t = checker.getTypeFromTypeNode(typeNode);
        const props = t.getProperties?.() ?? [];
        if (props.length > 0) {
          const params = props.map((sym) => inferParam(sym, p));
          return { shape: 'options', params };
        }
      }
    }
  }
  const params = methodDecl.parameters.map((p) => {
    const sym = checker.getSymbolAtLocation(p.name);
    return sym
      ? inferParam(sym, p)
      : { name: p.name.getText?.() ?? 'arg', kind: 'string', label: 'arg' };
  });
  return { shape: 'positional', params };
}

const registry = {};
for (const { ns, methods } of groups) {
  const cls = moduleClasses.get(ns);
  if (!cls) continue;
  const chainMethods = classChainMethods(cls);
  for (const m of methods) {
    const decl = chainMethods.get(m);
    if (!decl) continue;
    registry[`${ns}.${m}`] = inferSignature(decl);
  }
}

// ---------- 3. Emit ----------

const totalMethods = groups.reduce((acc, g) => acc + g.methods.length, 0);

const body = `// AUTO-GENERATED by scripts/generate-registry.mjs — do not edit by hand.
// Source: @faker-js/faker prototype introspection + .d.ts signatures.
// Namespaces: ${groups.length}, methods: ${totalMethods}, registry entries: ${Object.keys(registry).length}.

import type { MethodEntry } from './types.js';

export interface FakerGroup {
  readonly ns: string;
  readonly methods: readonly string[];
}

export const FAKER_GROUPS: readonly FakerGroup[] = ${JSON.stringify(groups, null, 2)} as const;

export const FAKER_REGISTRY: Readonly<Record<string, MethodEntry>> = ${JSON.stringify(registry, null, 2)} as const;
`;

const outPath = join(__dirname, '..', 'src', 'registry.generated.ts');
writeFileSync(outPath, body);
console.log(
  `wrote ${outPath} — ${groups.length} namespaces, ${totalMethods} methods, ${Object.keys(registry).length} signatures`,
);

// Run the merge step so callers only need a single command.
await import('./merge-catalog.mjs');
