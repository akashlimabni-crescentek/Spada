import { LayoutDashboard, Newspaper,ChartNoAxesCombined, CalendarX, ChartCandlestick } from "lucide-react"
import Link from "next/link"

export default function bottomNav(){


    return(
        

            <ul className="pr-2 pl-2 pt-3 pb-3 flex justify-between border-t border-border bg-sidebar fixed bottom-0 left-0 right-0 z-50">
                <Link href={"/dashboard"}><li className="t-meta flex flex-col items-center"><LayoutDashboard/> Dashboard</li></Link>
                <Link href={"/news"}><li className="t-meta flex flex-col items-center"><Newspaper /> News</li></Link>
                <Link href={"/market"}><li className="t-meta flex flex-col items-center"><ChartNoAxesCombined /> Markets</li></Link>
                <Link href={"/dispute"}><li className="t-meta flex flex-col items-center"><CalendarX /> Disputes</li></Link>
                <Link href={"/watchlist"}><li className="t-meta flex flex-col items-center"><ChartCandlestick /> Watchlist</li></Link>
            </ul>
            
        
    )
}