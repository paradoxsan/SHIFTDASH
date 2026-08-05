import { ClientDetail } from "@/components/clients/client-detail";

export default async function ClientPage({ params }: { params: Promise<{ client: string }> }) {
  const { client } = await params;
  return <ClientDetail clientId={client} />;
}
