"use client";

import { useNews } from "@/hooks/useNews";

import { SmNewsCard } from "@/components/custom/news/SmNewsCard";
import { MdNewsCard } from "@/components/custom/news/MdNewsCard";
import { LgNewsCard } from "@/components/custom/news/LgNewsCard";
import CategoryCarousel from "@/components/custom/categorycarousel";
import { useState } from "react";

export default function News() {
  
  const [selected, setSelected] = useState<string | null>(null);
  const { data: articles, isLoading, isError } = useNews(selected);
  


  if (isLoading) {
    return <div className="t-body">Loading...</div>;
  }

  if (isError || !articles) {
    return <div className="t-body text-negative">Failed to load news.</div>;
  }

  const BLOCK_SIZE = 8;

  const blocks = [];
  for (let i = 0; i < articles.length; i += BLOCK_SIZE) {
    blocks.push(articles.slice(i, i + BLOCK_SIZE));
  }

  return (
    <div className="m-5 flex flex-col gap-4 md:mt-20 lg:mt-20 mb-20">
      <h2 className="t-h2">News</h2>

      <CategoryCarousel selected={selected} onSelect={setSelected} />

      {blocks.map((block, i) => {
        const [lg1, md1, lg2, md2, md3, md4, sm1, sm2] = block;

        return (
          <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {lg1 && (
              <>
                <div className="hidden md:block md:col-span-2"><LgNewsCard article={lg1} /></div>
                <div className="md:hidden"><MdNewsCard article={lg1} /></div>
              </>
            )}
            {md1 && <div><MdNewsCard article={md1} /></div>}

            
            {lg2 && (
              <>
                <div className="hidden md:block md:col-span-2"><LgNewsCard article={lg2} /></div>
                <div className="md:hidden"><MdNewsCard article={lg2} /></div>
              </>
            )}
            {md2 && <div><MdNewsCard article={md2} /></div>}

            {/* Row 3 — medium, medium, then two small stacked in one cell */}
            {md3 && <div><MdNewsCard article={md3} /></div>}
            {md4 && <div><MdNewsCard article={md4} /></div>}
            {(sm1 || sm2) && (
              <div className="flex flex-col gap-4">
                {sm1 && <SmNewsCard article={sm1} />}
                {sm2 && <SmNewsCard article={sm2} />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}