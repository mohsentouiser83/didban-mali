"use client";
import { CaretDownIcon, SignOutIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export function HeaderAccountMenu({ name, onLogout }: {
  name: string;
  onLogout: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          aria-label="حساب کاربری"
          className="group gap-1 rounded-full border border-border p-1 pe-2"
        >
          <span aria-hidden className="grid size-9 place-items-center rounded-full bg-primary text-sm font-medium text-white">
            {Array.from(name.trim())[0] || "ک"}
          </span>
          <CaretDownIcon size={14} aria-hidden className="transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel className="truncate text-sm font-medium text-foreground">{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild onSelect={onLogout}>
          <Button variant="ghost" className="w-full justify-start text-danger [&>svg]:text-danger">
            <SignOutIcon size={18} aria-hidden />
            خروج از حساب
          </Button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
