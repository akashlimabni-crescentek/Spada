import { NewsArticle } from "@/types/news"
import { Card } from "@/components/ui/card"

export function LgNewsCard({ article }: { article: NewsArticle }){

    return(
        <a href={article.article_url} target="_blank" rel="noopener noreferrer">
    <Card className="flex flex-row max-w-190 overflow-hidden p-0 m-5 md:h-70">
        <div className="w-80 shrink-0 self-stretch">
            <img
                className="w-full h-full object-cover"
                src={article.image_url ?? "https://avatar.vercel.sh/shadcn1"}
                alt={article.title}
            />
        </div>

        <div className="flex flex-col gap-2 p-4 min-w-0 flex-1">
            <span className="t-ui">{article.category}</span>

            {/* Middle section — headline + blurb, grows to fill available space */}
            <div className="flex flex-col gap-2 flex-1 min-h-0">
                <span className="t-h2 line-clamp-3">{article.title}</span>
                
            </div>

            {/* Meta row — always pinned to the bottom of the card */}
            <div className="flex justify-between gap-3 shrink-0">
                <span className="t-ui">{new Date(article.published_at).toLocaleDateString("en-us")}</span>
                <span className="t-ui">{article.source}</span>
            </div>
        </div>
    </Card>
</a>
    )
}