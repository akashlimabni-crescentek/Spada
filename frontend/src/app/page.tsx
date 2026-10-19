import Image from "next/image";
import { Button } from "@/components/ui/button";
import StaticTicker from "@/components/custom/static/staticticker";
import SignalDemo from "@/components/custom/static/staticSignalDemo";
import LiveMarketChart from "@/components/custom/static/LiveMarketChart";
import SevenMetrics from "@/components/custom/static/sevenmetrics";
import StaticPortfolio from "@/components/custom/static/staticPortfolio"

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Footer from "@/components/custom/nav/footer";
import { Separator } from "@/components/ui/separator";
import SpadaLogo from "@/components/custom/static/SpadaLogo";

export default function Home() {





  return (

    <>

      <nav className="fixed top-0 left-0 right-0 z-50 bg-backgroundhighlight items-center justify-between flex h-12 md:h-14">
        <SpadaLogo/>
        <div className="flex items-center gap-3 mr-4">
          <Link href={'/login'}><Button>Login</Button></Link>
          <Link href={'/register'}><Button>Register</Button></Link>
        </div>

      </nav>



      <main className="mt-30 ">
        <div className="flex flex-col items-center text-center">

          {/* Hero Section */}


          <Image src="/SPADALOGOMAINPAGE.svg" alt="SPADA logo" width={600} height={600} />
          <h3 className="t-h2 max-w-2x1">The Frontier Intelligence Layer for Prediction Markets</h3>
          <p className="t-body max-w-70 md:max-w-80 lg:max-w-96 mt-4">Signals, Ratios, AI Briefings, Portfolio Analytics and more. unified under one platform built for the new generation of prediction market traders.</p>
          <Link href="/login"><Button variant="glow" className=" mt-8 mb-8"> Get Started <ArrowRight /></Button></Link>

          {/* Ticker */}
          <div className="mt-20 w-full overflow-hidden">
          <StaticTicker></StaticTicker>
          </div>

          {/* App Info card */}
          <div className="w-full  grid grid-cols-1 md:grid-cols-5 lg:grid-cols-5 items-center bg-backgroundhighlight  h-auto md:h-30 lg:h-30 divide-x divide-border">
            <div className="flex flex-col text-center pr-4 pl-4">
              <span className="t-h2 text-primary">50k+</span>
              <span className="t-h4">Live Markets</span>
            </div>
            <div className="flex flex-col  text-center pr-4 pl-4">
              <span className="t-h2 text-primary">8</span>
              <span className="t-h2">Signal Types</span>
            </div>
            <div className="flex flex-col text-center pr-4 pl-4">
              <span className="t-h2 text-primary pr-4 pl-4">2</span>
              <span className="t-h4">Platforms</span>
              <Separator orientation="vertical"></Separator>
            </div>
            <div className="flex flex-col text-center pr-4 pl-4">
              <span className="t-h2 text-primary pr-4 pl-4">7</span>
              <span className="t-h4">Ratio Metrics</span>
              <Separator orientation="vertical"></Separator>
            </div>

            <div className="flex flex-col text-center pr-4 pl-4">
              <span className="t-h2 text-primary">24/7 </span>
              <span className="t-h4">Monitoring</span>
            </div>

          </div>




          {/* Signal Section */}

          <div className="mt-10 text-left">

            <div className="flex flex-col md:flex-row gap-10 pt-4 text-left items-center md:items-start lg:items-start">
              <div className="flex flex-col flex-1 max-w-60 pt-4">
                <span className="t-h3 pb-3">Signals</span>
                <span className="t-h2">
                  Know the moment <span className="text-primary">something changes.</span>
                </span>
                <span className="t-body text-[18px] pt-4  leading-relaxed">
                  Signals are real-time alerts that fire when something significant
                  happens in a market — before the crowd notices. Our system monitors
                  thousands of markets across both platforms simultaneously, 24/7.
                  Watch specific markets, set your own thresholds, and get notified
                  the instant a volume spike, price anomaly, or liquidity shift
                  occurs. Act before the market corrects.
                </span>
              </div>
              <div className="w-70 md:w-[400px] shrink-0">
                <SignalDemo />
              </div>
            </div>
          </div>

          <Separator className="mt-10"></Separator>

          {/* Live Chart Section */}
          <div className="text-left">
            <div className="flex flex-col md:flex-row gap-10 pt-4 text-left items-center md:items-start lg:items-start">
              <div className="flex flex-col flex-1 max-w-60 pt-4">
                <span className="t-h3 pb-3">Charts</span>
                <span className="t-h2">
                  Every market. <span className="text-primary">Your preferred view.</span>
                </span>
                <span className="t-body text-[18px] pt-4 leading-relaxed">
                  Visualise any prediction market as a clean line chart or a full
                  technical candlestick view — switch in one click without leaving
                  the page. Read momentum, identify patterns, and spot reversals with
                  the same tools used in traditional markets, applied directly to
                  prediction market probabilities.
                </span>
              </div>
              <div className="w-70 md:w-[400px] shrink-0">
                <LiveMarketChart />
              </div>
            </div>
          </div>


          <Separator className="mt-8"></Separator>


          {/* Seven Metrics Section */}
          <div className="mt-10 flex flex-col items-center text-left">
            <div className="max-w-70 md:max-w-150">
              <div className="flex flex-col pt-4">
                <span className="t-h3 pb-3">Ratios</span>
                <span className="t-h2">
                  Seven metrics. <span className="text-primary">The full story behind the price.</span>
                </span>
                <span className="t-body text-[18px] pt-4 leading-relaxed">
                  Every market shows seven proprietary ratios calculated live from raw
                  order book and trade data. They go far beyond the YES/NO price —
                  revealing the market&apos;s internal health, activity level, and stress
                  at a glance.
                </span>
              </div>
              <div className="pt-8">
                <SevenMetrics />
              </div>
            </div>
          </div>


          <Separator className="mt-8"></Separator>


          {/* Portfolio Section */}

          <div className="text-left mt-10 flex flex-col  max-w-70 md:max-w-150">
            <h3 className="t-h3">Portfolio</h3>
            <span className="t-h2 pt-4">All Your Positions <span className="t-h2 text-primary"> One View</span> </span>
            
            <span className="pt-4 pb-4 t-body">Connect your Kalshi account, your Polymarket wallet, or both — and see your entire prediction market portfolio in one unified dashboard. No more switching between platforms. Track real-time P&L, analyse open positions against live ratios, and understand your performance across every market you have ever traded.</span>
            
            <StaticPortfolio></StaticPortfolio>
            
          </div>


          {/* Ending section */}

          <div className="mt-10">

            <Separator className="mb-4"></Separator>
            <span className="t-ui pt-4 mb-4">Mass Quantitative</span>
            <h2 className="t-h1 mb-1">The markets are moving</h2>
            <h2 className="t-h1 text-primary mb-4">Power Your Portfolio Today</h2>
            <Link href="/login"><Button variant="glow" className=" mt-8 mb-8"> Get Started <ArrowRight /></Button></Link>
            <Separator className="mb-4"></Separator>
          </div>



        </div>
      </main>

      <footer>
        <Footer></Footer>


      </footer>

    </>





  );
}
