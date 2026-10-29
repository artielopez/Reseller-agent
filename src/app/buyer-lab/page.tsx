import Link from "next/link";
import { demoMode } from "@/lib/config";
import { BuyerLab } from "@/components/buyer-lab";

export default function BuyerLabPage() {
  if (!demoMode)
    return (
      <main>
        <h1>Buyer lab requires demo mode</h1>
        <p>
          This prototype is not connected to your live inventory or messages.
        </p>
        <Link href="/">Back to inventory</Link>
      </main>
    );
  return <BuyerLab />;
}
