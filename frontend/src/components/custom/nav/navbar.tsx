"use client"


import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, LogOut } from "lucide-react";
import { useLogout } from "@/hooks/auth/useLogout";
import SpadaLogo from "../static/SpadaLogo";

// links for navigation purposes
const Links = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Markets", href: "/market" },
  { label: "News", href: "/news" },
  { label: "Watchlist", href: "/watchlist" },
];



export default function Navbar() {

  const { mutate: logout, isPending } = useLogout();
   const pathname = usePathname();
  

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-14 grid grid-cols-[1fr_auto_1fr] items-center px-6 border-b border-border bg-sidebar">
      

      
      <Link href="/dashboard" className="justify-self-start text-[21px] font-extrabold tracking-[5px] text-foreground shrink-0"> <SpadaLogo/></Link>
      

        <div className="flex items-center gap-6">
        {Links.map(({ label, href }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`t-ui rounded-md px-1 py-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                isActive ? "text-foreground font-bold" : "hover:text-foreground"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
        

        <div className="flex  ml-auto relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-dim pointer-events-none mr-5" />
          <input
            type="text"
            placeholder="Search markets, news, disputes..."
            className="w-full h-10 pl-9 pr-3 rounded-md bg-inset border border-input text-[13.5px] text-foreground placeholder:text-text-dim outline-none transition-colors focus:border-primary mr-4"
          />

        <button onClick={() => logout()} disabled={isPending} className="t-ui flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-raised disabled:opacity-40 shrink-0">
          <LogOut size={14} /> {isPending ? "Logging out…" : "Logout"}
        </button>
        </div>
       
        

      
    </nav>
  );
}