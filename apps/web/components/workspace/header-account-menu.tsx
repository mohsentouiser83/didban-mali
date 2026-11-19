"use client";
import Link from "next/link";
import {
  CaretDownIcon,
  SignOutIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export function HeaderAccountMenu({
  name,
  avatar,
  onLogout,
}: {
  name: string;
  avatar?: string | null;
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
          {avatar ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={avatar}
              alt={name}
              className="size-9 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="grid size-9 place-items-center rounded-full bg-primary text-sm font-medium text-white"
            >
              {Array.from(name.trim())[0] || "ک"}
            </span>
          )}
          <CaretDownIcon
            size={14}
            aria-hidden
            className="transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel className="truncate text-sm font-medium text-foreground">
          {name}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            href="/settings/profile"
            className="flex w-full items-center gap-2 rounded-control px-3 py-2 text-sm text-foreground transition-colors hover:bg-canvas"
          >
            <UserCircleIcon size={18} aria-hidden />
            پروفایل کاربری
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild onSelect={onLogout}>
          <Button
            variant="ghost"
            className="w-full justify-start text-danger [&>svg]:text-danger"
          >
            <SignOutIcon size={18} aria-hidden />
            خروج از حساب
          </Button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
