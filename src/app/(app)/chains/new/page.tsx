import { requireAdmin } from "@/lib/admin";
import { PageHeader } from "@/components/ui";
import { ChainForm } from "../chain-form";
import { createChain } from "../actions";

export default async function NewChainPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="New chain" description="Name it first. You'll add steps on the next screen." back={{ href: "/", label: "All chains" }} />
      <div className="panel max-w-2xl rounded-2xl p-6">
        <ChainForm action={createChain} submitLabel="Create chain" />
      </div>
    </>
  );
}
