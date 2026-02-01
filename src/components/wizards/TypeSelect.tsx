import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from "../ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

type TypeSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  triggerClassName?: string;
  includeVoid?: boolean;
  specialOptions?: { value: string; label: string; tooltip?: string }[];
};

export const TypeSelect = ({
  value,
  onValueChange,
  placeholder = "Select type",
  disabled,
  triggerClassName,
  includeVoid = false,
  specialOptions = []
}: TypeSelectProps) => (
  <Select value={value} onValueChange={onValueChange} disabled={disabled}>
    <SelectTrigger className={triggerClassName ?? "h-8 w-full"}>
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent>
      <TooltipProvider>
        {includeVoid || specialOptions.length > 0 ? (
          <>
            <SelectGroup>
              <SelectLabel>Special</SelectLabel>
              {includeVoid ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SelectItem value="void">void</SelectItem>
                  </TooltipTrigger>
                  <TooltipContent>No return value</TooltipContent>
                </Tooltip>
              ) : null}
              {specialOptions.map((option) =>
                option.tooltip ? (
                  <Tooltip key={option.value}>
                    <TooltipTrigger asChild>
                      <SelectItem value={option.value}>{option.label}</SelectItem>
                    </TooltipTrigger>
                    <TooltipContent>{option.tooltip}</TooltipContent>
                  </Tooltip>
                ) : (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                )
              )}
            </SelectGroup>
            <SelectSeparator />
          </>
        ) : null}
        <SelectGroup>
          <SelectLabel>Numeric</SelectLabel>
          <Tooltip>
            <TooltipTrigger asChild>
              <SelectItem value="int">int</SelectItem>
            </TooltipTrigger>
            <TooltipContent>32-bit signed integer</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <SelectItem value="long">long</SelectItem>
            </TooltipTrigger>
            <TooltipContent>64-bit signed integer</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <SelectItem value="float">float</SelectItem>
            </TooltipTrigger>
            <TooltipContent>32-bit floating point</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <SelectItem value="double">double</SelectItem>
            </TooltipTrigger>
            <TooltipContent>64-bit floating point</TooltipContent>
          </Tooltip>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Textual</SelectLabel>
          <Tooltip>
            <TooltipTrigger asChild>
              <SelectItem value="String">String</SelectItem>
            </TooltipTrigger>
            <TooltipContent>Text string</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <SelectItem value="char">char</SelectItem>
            </TooltipTrigger>
            <TooltipContent>Single UTF-16 code unit</TooltipContent>
          </Tooltip>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Logical</SelectLabel>
          <Tooltip>
            <TooltipTrigger asChild>
              <SelectItem value="boolean">boolean</SelectItem>
            </TooltipTrigger>
            <TooltipContent>true or false</TooltipContent>
          </Tooltip>
        </SelectGroup>
      </TooltipProvider>
    </SelectContent>
  </Select>
);
