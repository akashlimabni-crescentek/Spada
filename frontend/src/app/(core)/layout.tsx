import type { Metadata } from "next";
import "../globals.css";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import SideBar from "@/components/custom/nav/sidebar";
import Navbar from "@/components/custom/nav/navbar";
import BottomNav from "@/components/custom/nav/bottomNav";
import SmTopNav from "@/components/custom/nav/smTopNav";
import { PriceStreamConnector } from "@/providers/priceStreamConnector";

export const metadata: Metadata = {
  title: "SPADA",
  description: "Prediction markets",
};

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <>

    <PriceStreamConnector />

      <div className="md:hidden">
        <SmTopNav />
      </div>

      <SidebarProvider>
        <div className="hidden md:block">
          <Navbar />
          <SideBar />
        </div>

        <SidebarInset>
          
          <main>{children}</main>
        </SidebarInset>
      </SidebarProvider>

      <div className="md:hidden">
        <BottomNav />
      </div>
    </>
  );
}