import {Collapsible,CollapsibleContent,CollapsibleTrigger,} from "@/components/ui/collapsible"
import {
  Item,
  ItemTitle,
} from "@/components/ui/item"


import { ChevronDown, Plus } from "lucide-react";
export default function SideBarDropdown() {




    return(
        <Collapsible>

                        <CollapsibleTrigger className="flex items-center gap-2">
                            <ChevronDown />
                            <h4>Workstations</h4>
                            <Plus />
                        </CollapsibleTrigger>


                        <CollapsibleContent>
                            <Item>
                                <ItemTitle >
                                    <h4>Trump 2025</h4>
                                </ItemTitle>
                            </Item>
                            <Item>
                                <ItemTitle >
                                    <h4>FED Rate Cut</h4>
                                </ItemTitle>
                            </Item>
                            <Item>
                                <ItemTitle >
                                    <h4>Disputes</h4>
                                </ItemTitle>
                            </Item>

                        </CollapsibleContent>

                    </Collapsible>
    );

}