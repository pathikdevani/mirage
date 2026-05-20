import {
  Box,
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

const ICONS: Record<string, LucideIcon> = {
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
  box: Box,
};

export const SET_ICON_NAMES = Object.keys(ICONS) as ReadonlyArray<string>;

export function IconByName({ name, size = 14 }: { name: string; size?: number }) {
  const Icon = ICONS[name] ?? Box;
  return <Icon size={size} strokeWidth={1.75} />;
}
