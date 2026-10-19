"use client"
import { Menu, X, Bell, Settings, LogOut } from "lucide-react"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import Link from "next/link"
import SpadaLogo from "../static/SpadaLogo";
import { useProfile } from "@/hooks/useProfile";
import { useLogout } from "@/hooks/auth/useLogout";
export default function SmTopNav() {




    const { data: user } = useProfile();
    const { mutate: logout, isPending } = useLogout();

    return (
        <>


            <div className="flex justify-between  bg-backgroundhighlight p-3 md:hidden lg:hidden">

                {/* Dropdown Section on Top Nav */}
                <Sheet>
                    <SheetTrigger>
                        <Menu />
                    </SheetTrigger>
                    <SheetContent side="left">
                        <SheetTitle className="mt-4 flex justify-center"> <SpadaLogo /></SheetTitle>




                        {/* Tab Section */}
                        <Separator></Separator>
                        <div className="flex flex-col pl-4">
                            <h1 className="t-ui">Tabs</h1>





                        </div>


                        {/* Workstation Section */}
                        <Separator></Separator>
                        <div className="flex flex-col pl-4">
                            <span className="t-ui">Workstations</span>

                        </div>


                        {/* Platform Section */}
                        <Separator></Separator>
                        <div className="flex flex-col pl-4">
                            <span className="t-meta">Platform</span>
                            <span className="t-ui">Our Story</span>
                            <span className="t-ui">Mass Credits</span>
                            <span className="t-ui">API</span>
                            <span className="t-ui">Pricing</span>
                            <span className="t-ui">Contact</span>
                            <span className="t-ui">Help</span>
                        </div>
                        {/* User Profile Section */}
                        <Separator></Separator>

                        <Link href='/profile'>
                            <div className="flex flex-row items-center ml-4">
                                <Avatar>
                                    <AvatarImage src={user?.avatar_url ?? "https://github.com/shadcn.png"} alt={user?.display_name ?? "User"} className="grayscale" />
                                    <AvatarFallback>{user?.display_name?.slice(0, 2).toUpperCase() ?? "U"}</AvatarFallback>
                                </Avatar>
                                <h4 className="t-h4 pl-4">{user?.display_name ?? "User"}</h4>
                            </div>
                        </Link>

                        <div className="flex flex-row items-center justify-between p-4">
                            <Bell></Bell>
                            <X></X>
                            <Settings></Settings>
                            <Settings></Settings>
                            <Settings></Settings>

                        </div>




                    </SheetContent>
                </Sheet>


                <SpadaLogo/>
                

                <button onClick={() => logout()} disabled={isPending} className="t-ui flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-raised disabled:opacity-40 shrink-0">
                    <LogOut size={14} /> {isPending ? "Logging out…" : "Logout"}
                </button>



            </div>
        </>
    )

}