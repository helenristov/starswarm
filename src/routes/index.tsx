import { createFileRoute } from "@tanstack/react-router";
import { StarSwarm } from "@/components/game/StarSwarm";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <StarSwarm />;
}
