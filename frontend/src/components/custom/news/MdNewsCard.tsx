import { Card } from "@/components/ui/card";
import { NewsArticle } from "@/types/news";

export function MdNewsCard({ article }: { article: NewsArticle }){

    return(
        <a href={article.article_url} target="_blank" rel="noopener noreferrer">
        <Card className="m-5 md:max-w-110 md:h-70 overflow-hidden flex flex-col">
            <img
              className="w-full h-30 max-h-30 shrink-0 object-cover"
              src={article.image_url ?? "https://avatar.vercel.sh/shadcn1"}
              alt=""
            />

            
            <div className="flex flex-col gap-2 flex-1 min-h-0 px-5 pt-3">
                <span className="t-ui">{article.category}</span>
                <span className="t-h3 line-clamp-3">{article.title}</span>
            </div>

           
            <div className=" flex justify-between gap-3 shrink-0 px-5 pb-4">
              <span className="t-ui">{new Date(article.published_at).toLocaleDateString("en-us")}</span>
              <span className="t-ui">{article.source}</span>
            </div>
        </Card>
        </a>
    );
}