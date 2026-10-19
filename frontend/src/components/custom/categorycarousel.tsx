"use client";

const categories = ["Sport", "Politics",  "Tech", "Crypto", "Finance"];

interface CategoryCarouselProps {
  selected: string | null;
  onSelect: (category: string | null) => void;
  
}

export default function CategoryCarousel({ selected, onSelect }: CategoryCarouselProps) {




  return (
    <div className="flex gap-3 overflow-x-auto  scrollbar-none">
      <button
        onClick={() => onSelect(null)}
        className={`shrink-0 px-3 py-1.5 rounded-full border text-sm transition-colors ${
          selected === null
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-muted text-muted-foreground border-border hover:bg-accent"
        }`}
      >
        All
      </button>

      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onSelect(cat)}
          className={`shrink-0 px-3 py-1.5 rounded-full border text-sm transition-colors ${
            selected === cat
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-muted text-muted-foreground border-border hover:bg-accent"
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
