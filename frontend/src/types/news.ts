export interface NewsArticle {
  id: string;
  market_id: string;
  canonical_id: string;
  headline: string;
  title: string;
  source: string;
  article_url: string;
  url: string;
  correlation_score: number;
  sentiment_score: number;
  published_at: string;
  image_url: string; 
  category: string
}

export interface NewsResponse {
  articles: NewsArticle[];
}

export interface RelatedArticle {
  market_id: string;
  canonical_id: string;
  headline: string;
  title: string;
  source: string;
  article_url: string;
  url: string;
  sentiment_score: number;
  published_at: string;
  image_url: string; 
}

export interface RelatedNewsResponse {
  correlations: RelatedArticle[];
}