import { Card } from "@/components/ui/card";
import { TripForm } from "./trip-form";

export default function NewTripPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">Neue Reise</h1>
      <Card>
        <TripForm />
      </Card>
    </main>
  );
}
