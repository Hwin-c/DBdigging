import { Suspense } from "react";
import { DigApp } from "@/components/dig/DigApp";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <DigApp />
    </Suspense>
  );
}
