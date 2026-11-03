import { requireAdmin } from "@/lib/admin";
import { PageHeader } from "@/components/ui";
import { ChainForm } from "../chain-form";
import { createChain } from "../actions";

export default async function NewChainPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader
        eyebrow="New recipe"
        title="Create a chain"
        description="Give it a name and a voice. You'll add the steps on the next screen."
        back={{ href: "/", label: "All chains" }}
      />
      <div className="panel max-w-2xl p-6 sm:p-8">
        <ChainForm action={createChain} submitLabel="Create chain" />
      </div>
    </>
  );
}
