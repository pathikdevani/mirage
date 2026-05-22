/**
 * Mirage schema editor — args UI prototype.
 *
 * Reimplements the existing PropertyEditor grid + FakerCell using the live
 * styling (Tailwind v4 + shadcn tokens) and layers in three different UI
 * patterns for entering faker method arguments, switchable from the Tweaks
 * panel:
 *
 *   1) "popover"   — Args panel anchored to an "args" chip next to the cell
 *   2) "inline"    — Row expands to reveal an args strip below
 *   3) "sidepanel" — Right-hand details drawer (Notion-style)
 */

const { useEffect, useLayoutEffect, useMemo, useRef, useState } = React;

// ---------- registry (full faker v9 prototype — defined in faker-catalog.js) ----------
const FAKER_GROUPS = window.FAKER_GROUPS;

// ---------- icons (lucide subset, inline so we have no deps) ----------
const Icon = {
  Chevron: ({ size = 12, dir = 'down', className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={{ transform: dir === 'right' ? 'rotate(-90deg)' : dir === 'up' ? 'rotate(180deg)' : 'none' }}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  Grip: ({ size = 12 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="19" r="1" />
      <circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="19" r="1" />
    </svg>
  ),
  Trash: ({ size = 12 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  ),
  Search: ({ size = 12 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
  ),
  Sliders: ({ size = 12 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  ),
  Plus: ({ size = 12 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5v14" />
    </svg>
  ),
  X: ({ size = 12 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  ),
  Code: ({ size = 12 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
    </svg>
  ),
  Link: ({ size = 12 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  Dice: ({ size = 12 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <circle cx="8" cy="8" r="1" fill="currentColor"/><circle cx="16" cy="8" r="1" fill="currentColor"/>
      <circle cx="12" cy="12" r="1" fill="currentColor"/>
      <circle cx="8" cy="16" r="1" fill="currentColor"/><circle cx="16" cy="16" r="1" fill="currentColor"/>
    </svg>
  ),
};

// ---------- helpers ----------
const cn = (...xs) => xs.filter(Boolean).join(' ');

function methodHasArgs(method) {
  const c = window.FAKER_CATALOG[method];
  return !c || c.params.length > 0;
}

/** Sample value preview, drawn from a tiny faker simulation. */
function previewValue(method, args, rng) {
  // Normalize args: ref objects + ref-tokens are unknown at preview time, so
  // we strip them (faker would otherwise fall back to its own sample) — that
  // keeps the live preview honest about "this will be filled at generation".
  if (args && typeof args === 'object') {
    const cleaned = {};
    for (const k of Object.keys(args)) {
      const v = args[k];
      if (v && typeof v === 'object' && typeof v.$ref === 'string') continue;
      if (typeof v === 'string' && /\{\{[^}]+\}\}/.test(v)) continue;
      cleaned[k] = v;
    }
    args = cleaned;
  }
  try {
    const c = window.FAKER_CATALOG[method];
    const r = rng ?? Math.random;
    if (method === 'person.firstName') {
      const f = ['Avery','Casey','Drew','Emerson','Hayden','Indigo','Jules','Kai','Lior','Morgan','Niko','Quinn'];
      const m = ['Adrian','Bryce','Caleb','Devon','Elliot','Felix','Grant','Hugo','Ivan','Jonah','Kieran','Owen'];
      const sex = args?.sex;
      const list = sex === 'female' ? f : sex === 'male' ? m : [...f, ...m];
      return list[Math.floor(r() * list.length)];
    }
    if (method === 'person.lastName') {
      const ls = ['Park','Hayes','Okafor','Lindgren','Sato','Marin','Vance','Brennan','Acosta','Lim'];
      return ls[Math.floor(r() * ls.length)];
    }
    if (method === 'internet.email') {
      const provider = args?.provider || 'example.com';
      const fn = (args?.firstName || ['ada','linus','grace','alan'][Math.floor(r()*4)]).toLowerCase();
      const ln = (args?.lastName || ['lovelace','torvalds','hopper','turing'][Math.floor(r()*4)]).toLowerCase();
      return `${fn}.${ln}@${provider}`;
    }
    if (method === 'string.uuid') {
      return [8,4,4,4,12].map((n) => Array.from({length:n}, () => Math.floor(r()*16).toString(16)).join('')).join('-');
    }
    if (method === 'string.alphanumeric' || method === 'string.alpha' || method === 'string.numeric' || method === 'string.sample' || method === 'string.nanoid') {
      const len = args?.length ?? 10;
      const casing = args?.casing ?? 'mixed';
      let alpha = 'abcdefghijklmnopqrstuvwxyz';
      if (casing === 'upper') alpha = alpha.toUpperCase();
      if (casing === 'mixed') alpha = alpha + alpha.toUpperCase();
      let chars = method === 'string.numeric' ? '0123456789' : method === 'string.alpha' ? alpha : alpha + '0123456789';
      if (method === 'string.nanoid') chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';
      let s = '';
      for (let i = 0; i < len; i++) s += chars[Math.floor(r() * chars.length)];
      return s;
    }
    if (method === 'number.int') {
      const min = args?.min ?? 0, max = args?.max ?? 1000;
      return String(Math.floor(r() * (max - min + 1)) + min);
    }
    if (method === 'number.float') {
      const min = args?.min ?? 0, max = args?.max ?? 1;
      const fd = args?.fractionDigits ?? 2;
      return (r() * (max - min) + min).toFixed(fd);
    }
    if (method === 'date.between') {
      const from = args?.from ? Date.parse(args.from) : Date.parse('2020-01-01');
      const to = args?.to ? Date.parse(args.to) : Date.parse('2025-12-31');
      const d = new Date(from + r() * (to - from));
      return d.toISOString();
    }
    if (method === 'date.past' || method === 'date.future' || method === 'date.recent' || method === 'date.soon') {
      const now = Date.now();
      const yrs = (args?.years ?? 1) * 365 * 86400000;
      const days = (args?.days ?? 1) * 86400000;
      const span = (method === 'date.past' || method === 'date.future') ? yrs : days;
      const sign = (method === 'date.past' || method === 'date.recent') ? -1 : 1;
      return new Date(now + sign * r() * span).toISOString();
    }
    if (method === 'date.birthdate') {
      const min = args?.min ?? 18, max = args?.max ?? 80;
      const age = Math.floor(r() * (max - min + 1)) + min;
      return new Date(Date.now() - age * 365 * 86400000).toISOString().slice(0, 10);
    }
    if (method === 'finance.amount' || method === 'commerce.price') {
      const min = args?.min ?? 0, max = args?.max ?? 1000;
      const dec = args?.dec ?? 2;
      const sym = args?.symbol || '';
      return sym + (r() * (max - min) + min).toFixed(dec);
    }
    if (method === 'helpers.arrayElement') {
      const arr = args?.array ?? ['option-a','option-b'];
      return String(arr[Math.floor(r() * arr.length)]);
    }
    if (method === 'helpers.fromRegExp') {
      return args?.pattern ? `~ /${args.pattern}/` : 'XYZ-1234';
    }
    if (method === 'helpers.replaceSymbols') {
      const p = args?.string ?? '###-???-###';
      return p.replace(/[#?*]/g, (ch) => {
        if (ch === '#') return Math.floor(r() * 10);
        if (ch === '?') return 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(r() * 24)];
        return (r() < 0.5 ? Math.floor(r()*10) : 'ABCDEF'[Math.floor(r()*6)]);
      });
    }
    if (method === 'lorem.words' || method === 'lorem.sentence' || method === 'lorem.sentences' || method === 'lorem.paragraph' || method === 'lorem.paragraphs') {
      const lex = ['lorem','ipsum','dolor','sit','amet','consectetur','adipiscing','elit','sed','do'];
      const n = method === 'lorem.words' ? (args?.count ?? 3) : method === 'lorem.sentence' ? (args?.wordCount ?? 6) : (args?.count ?? 3);
      const out = Array.from({ length: n }, () => lex[Math.floor(r()*lex.length)]).join(' ');
      return method.startsWith('lorem.sentence') || method.startsWith('lorem.paragraph') ? out + '.' : out;
    }
    if (method === 'internet.url') {
      return (args?.protocol ?? 'https') + '://acme.test' + (args?.appendSlash ? '/' : '');
    }
    if (method === 'airline.flightNumber') {
      const len = args?.length ?? 4;
      return Array.from({ length: len }, () => Math.floor(r()*10)).join('');
    }
    if (method === 'company.name') return ['Acme Robotics','Northwind','Aperture','Globex','Tyrell'][Math.floor(r()*5)];
    return '…';
  } catch (e) {
    return '…';
  }
}

window.SchemaModule = {
  FAKER_GROUPS, Icon, cn, methodHasArgs, previewValue,
};
