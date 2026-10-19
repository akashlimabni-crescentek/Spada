import { Card } from "@/components/ui/card";
import { NewsArticle, RelatedArticle } from "@/types/news";

type NewsCardArticle = NewsArticle | RelatedArticle;

export function SmNewsCard({ article }: { article: NewsCardArticle }) {

    return (
        <a href={article.article_url} target="_blank" rel="noopener noreferrer">
            <Card className="flex flex-row gap-3 m-5 p-0 overflow-hidden items-stretch h-24 md:max-w-110">
                <img
                    className="w-24 h-full object-cover shrink-0"
                    src={article.image_url}
                    alt=""
                />

                <div className="flex flex-col justify-center gap-1 flex-1 min-w-0 py-2 pr-4">
                    <span className="t-h3 line-clamp-2">{article.headline}</span>
                    <span className="t-label text-muted-foreground">{article.source}</span>
                    <span className="t-label text-muted-foreground">
                        {new Date(article.published_at).toLocaleDateString("en-us")}
                    </span>
                </div>
            </Card>
        </a>
    );
}