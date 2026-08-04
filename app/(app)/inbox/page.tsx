import { PageHeader } from "@/components/ui";
import { UnderConstruction } from "@/components/shell/under-construction";

export default function InboxPage() {
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <PageHeader title="שיחות" subtitle="הוואטסאפ של כל הבוטים במקום אחד" />
      <UnderConstruction
        what="Inbox אחיד חוצה-לקוחות: חיפוש, סינון, קריאת שיחה, שליחת הודעה והשתקת הבוט — בלי להחליף לקוח בכל פעם."
        phase="שלב 4"
      />
    </div>
  );
}
