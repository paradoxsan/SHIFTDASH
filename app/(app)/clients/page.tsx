import { PageHeader } from "@/components/ui";
import { UnderConstruction } from "@/components/shell/under-construction";

export default function ClientsPage() {
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <PageHeader title="לקוחות" subtitle="בריאות הבוט · מצב תשלום · פרטי התקשרות" />
      <UnderConstruction
        what="כרטיס לכל לקוח: האם הבוט שלו עובד וכמה שגיאות היו השבוע, האם שילם החודש ומה פתוח, ופרטי ההתקשרות וההסכם."
        phase="שלב 3"
      />
    </div>
  );
}
