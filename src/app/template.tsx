import { SplatArrivals } from "@/components/SplatArrivals";

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div className="route-fade">
      <SplatArrivals />
      {children}
    </div>
  );
}
