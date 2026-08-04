// Barrel for the UI primitives. `@/components/ui` used to be a single file;
// keeping the same import path means the older screens keep compiling while the
// new interface is built out.
export {
  Card,
  CardHeader,
  Badge,
  StatusDot,
  Stat,
  HealthDot,
  HEALTH_META,
  toneColor,
  type Tone,
} from "./primitives";

export {
  PageHeader,
  Spinner,
  Skeleton,
  SkeletonCard,
  ErrorBanner,
  EmptyState,
} from "./feedback";

export { Tabs, type TabDef } from "./tabs";
export { Sheet } from "./sheet";
