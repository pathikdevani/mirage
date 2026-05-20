import {
  BookOpen,
  Box,
  Code2,
  Database,
  Download,
  History,
  Network,
  Play,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export interface NavSection {
  section: string;
  items: NavItem[];
}

/** Paths are workspace-relative — Sidebar prepends `/workspaces/:wsId/`. */
export const NAV: NavSection[] = [
  {
    section: 'Workspace',
    items: [
      { label: 'Schemas', path: 'schemas', icon: Database },
      { label: 'Sets', path: 'sets', icon: Box },
      { label: 'Functions', path: 'functions', icon: Code2 },
      { label: 'Dependency graph', path: 'graph', icon: Network },
      { label: 'Generate', path: 'generate', icon: Play },
    ],
  },
  {
    section: 'Activity',
    items: [
      { label: 'Run history', path: 'history', icon: History },
      { label: 'Exports', path: 'connectors', icon: Download },
    ],
  },
  {
    section: 'Library',
    items: [
      { label: 'Faker reference', path: 'fakers', icon: BookOpen },
      { label: 'Settings', path: 'settings', icon: Settings },
    ],
  },
];
