import BuckshotGame from "@/components/BuckshotGame";

export default function BuckshotPage({ searchParams }: { searchParams?: { t?: string } }) {
  return <BuckshotGame variant="buckshot" tournamentId={searchParams?.t ?? null} />;
}
