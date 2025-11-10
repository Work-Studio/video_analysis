import SummaryPageClient from "./SummaryPageClient";

interface SummaryPageProps {
  params: {
    id: string;
  };
}

export default function SummaryPage({ params }: SummaryPageProps) {
  return <SummaryPageClient params={params} />;
}
