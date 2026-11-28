"use client";

import {
  ArrowCounterClockwiseIcon, ArrowUpLeftIcon, CheckCircleIcon, DotsThreeIcon,
  DownloadSimpleIcon, EyeIcon, PencilSimpleIcon, TrashIcon,
} from "@phosphor-icons/react";
import { Children, Fragment, isValidElement, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button, ButtonLink } from "./button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu";

function hasActions(children: ReactNode): boolean {
  return Children.toArray(children).some((child) =>
    isValidElement<{ children?: ReactNode }>(child) &&
    (child.type !== Fragment || hasActions(child.props.children)),
  );
}

export function TableRowActions({ children, label }: { children: ReactNode; label: string }) {
  if (!hasActions(children)) return null;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="size-11 min-w-11 p-0 data-[state=open]:bg-primary-soft"
          aria-label={label}
          onClick={(event) => event.stopPropagation()}
        >
          <DotsThreeIcon size={22} weight="bold" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-max min-w-48 max-w-[min(18rem,calc(100vw-1.5rem))] p-1.5" onClick={(event) => event.stopPropagation()}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const actionIcons = {
  open: ArrowUpLeftIcon,
  view: EyeIcon,
  edit: PencilSimpleIcon,
  delete: TrashIcon,
  download: DownloadSimpleIcon,
  approve: CheckCircleIcon,
  reverse: ArrowCounterClockwiseIcon,
};

type ActionAppearance = {
  children: ReactNode;
  icon?: ReactNode;
  kind?: keyof typeof actionIcons;
  danger?: boolean;
};

type ActionButtonProps = ActionAppearance & Pick<ComponentProps<typeof Button>, "onClick" | "disabled" | "busy" | "aria-label" | "title">;
type ActionLinkProps = ActionAppearance & Pick<ComponentProps<typeof ButtonLink>, "href" | "onClick" | "target" | "rel" | "download" | "aria-label" | "title">;

export function TableRowAction({ children, icon, kind = "open", danger, ...props }: ActionButtonProps | ActionLinkProps) {
  const Icon = actionIcons[kind];
  const content = (
    <>
      <span
        aria-hidden
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-control bg-primary-soft text-primary [&_svg]:size-4",
          danger && "bg-danger-soft text-danger",
        )}
      >
        {icon ?? <Icon aria-hidden />}
      </span>
      <span className="min-w-0 whitespace-normal">{children}</span>
    </>
  );
  const className = cn(
    "w-full cursor-pointer gap-2.5 px-2.5 text-start font-medium data-disabled:cursor-default",
    danger && "text-danger data-highlighted:bg-danger-soft data-highlighted:text-danger",
  );
  const accessibleLabel = props["aria-label"];
  return "href" in props ? (
    <DropdownMenuItem asChild className={className} textValue={accessibleLabel}>
      <ButtonLink variant="menu" {...props}>{content}</ButtonLink>
    </DropdownMenuItem>
  ) : (
    <DropdownMenuItem asChild className={className} textValue={accessibleLabel} disabled={props.disabled || props.busy}>
      <Button variant="menu" {...props}>{content}</Button>
    </DropdownMenuItem>
  );
}
