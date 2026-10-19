import { Button } from "@/components/ui/button";
import { CardDescription, CardHeader } from "@/components/ui/card";
import { TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import Image from "next/image";


export default function Footer(){



    return (
        <div className="mt-10 pt-4 pb-4 bg-backgroundhighlight flex flex-col items-center lg:flex lg:flex-col lg:items-center w-full">


            <div className="ml-4 mr-4 bg-card border border-border rounded-lg p-3  max-w-sm md:max-w-[700px] lg:max-w-3xl mx-auto">
                <CardHeader className=" w-full flex t-h4"><TriangleAlert className="mr-4" /> Important Notice</CardHeader>
                <CardDescription className="w-full max-w-sm md:max-w-[700px] lg:max-w-3xl mx-auto text-left">Spada is a data analytics and intelligence platform. Nothing on this website or within the Spada product constitutes financial advice, investment advice, or a personal recommendation to buy, sell, or hold any financial instrument. Therefore Mass Quantitative Limited (CRO: 813902) is not regulated by the Central Bank of Ireland or any other financial services regulatory authority. All information is provided for informational and analytical purposes only. You are solely responsible for any investment or trading decisions you make. Prediction markets involve financial risk; the value of positions may fall as well as rise. Past performance is not indicative of future results</CardDescription>
            </div>

            <div className="mt-8 flex flex-col items-center lg:flex lg:flex-row  lg:max-w-3xl">
                <div className=" max-w-70 lg:w-80 lg:mr-10">
                    <div>
                        <h4 className="t-label">Spada</h4>
                        <Separator></Separator>
                        <span className="t-body">Cross-platform prediction market intelligence. Pricing, edge and resolution risk in one workspace.</span>
                    </div>
                    <div className="flex mt-4">
                        <Input className="mr-4 " ></Input>
                        <Button>Subscribe</Button>
                    </div>
                </div>

                <div className=" mt-4 grid grid-cols-2 place-items-center">
                    <div >
                        <h4 className="t-label ">Platform</h4>
                        <Separator />
                        <ul>
                            <li className="t-body pt-1">API</li>
                            <li className="t-body pt-1">Mass Credits</li>
                            <li className="t-body pt-1" >Pricing</li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="t-label ">Contact</h4>
                        <Separator />
                        <ul>
                            <li className="t-body pt-1">Instagram</li>
                            <li className="t-body pt-1">Discord</li>
                            <li className="t-body pt-1" >X</li>
                        </ul>
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-center text-left">
                
                <Image src="/spada-seal.svg" alt="SPADA Seal" width={200} height={200} />
                <div className="flex flex-col max-w-60 text-center">
                    <span className="t-h4">Mass Quantitative</span>
                    <span className="t-meta">© 2026 Mass Quantitative Limited.</span>
                    <span className="t-meta">All rights reserved.</span>
                    <span className="t-meta">VAT: IE4732069JH</span>
                    <span className="t-meta">CRO: 813902 </span>
                    <span className="t-meta">Incorporated in Ireland under the Companies Act 2014</span>
                    
                </div>
            </div>

            











        </div>
    )
}