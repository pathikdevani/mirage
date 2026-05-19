import {
  Briefcase,
  Database,
  Globe,
  Home,
  IdCard,
  Key,
  Mail,
  Package,
  Phone,
  Tag,
  User,
  type LucideIcon,
} from 'lucide-react';
import type { IconName } from './types.js';

const MAP: Record<IconName, LucideIcon> = {
  home: Home,
  briefcase: Briefcase,
  mail: Mail,
  phone: Phone,
  'id-card': IdCard,
  globe: Globe,
  tag: Tag,
  package: Package,
  key: Key,
  database: Database,
  user: User,
};

export function resolveIcon(name: string): LucideIcon {
  return MAP[name as IconName] ?? Database;
}

export const ICON_ENTRIES: ReadonlyArray<readonly [IconName, LucideIcon]> = Object.entries(MAP) as ReadonlyArray<readonly [IconName, LucideIcon]>;
