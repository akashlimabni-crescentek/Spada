"use client";

import { SlidersHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SortDropdownProps {
  onSortSelect: (sort: string) => void;
}

export default function SortDropdown({ onSortSelect }: SortDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="text-dim hover:text-foreground">
        <SlidersHorizontal className="h-6 w-6" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onSortSelect("volume_desc")}>Highest volume</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSortSelect("volume_asc")}>Lowest volume</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSortSelect("time_asc")}>Ending soon</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSortSelect("time_desc")}>Ending latest</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}