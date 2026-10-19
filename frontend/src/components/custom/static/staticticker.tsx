

export default function StaticTicker() {

    
    const items = [
        { name: "Bitcoin $100k", change: "+2.4%" },
        { name: "US Election", change: "Yes 64¢" },
        { name: "Fed Rate Cut", change: "No 72¢" },
        { name: "ETH $5k", change: "+1.8%" },
        { name: "World Cup 2026", change: "Brazil 22¢" },
        { name: "AI Regulation", change: "Yes 45¢" },
    ];


    return (
        <div className="w-full overflow-hidden bg-backgroundhighlight border-y border-border py-2">
            <div className="flex items-stretch gap-8 animate-scroll">
                {[...items, ...items].map((item, i) => (
                    <span key={i} className="shrink-0 flex items-stretch gap-4">
                        <span className="flex items-center gap-2">
                            <span className="t-ui text-foreground">{item.name}</span>
                            <span className="n-sm text-positive">{item.change}</span>
                        </span>
                        <span className="w-px bg-border self-stretch shrink-0" aria-hidden="true" />
                    </span>
                ))}
            </div>
        </div>
    );
}