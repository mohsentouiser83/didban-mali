"use client";
import { type ComponentProps } from "react";
import { Dialog } from "./dialog";

export type DrawerProps = Omit<ComponentProps<typeof Dialog>, "sheet">;

export function Drawer(props: DrawerProps) {
  return <Dialog {...props} sheet />;
}
